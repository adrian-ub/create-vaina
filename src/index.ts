import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import mri from 'mri'
import * as p from '@clack/prompts'
import c from 'picocolors'
import { resolveCommand } from 'package-manager-detector/commands'
import { detectSync } from 'package-manager-detector/detect'
import spawn from 'cross-spawn'

import { emptyDir, formatTargetDir, isEmpty, isValidPackageName, toValidPackageName, copy } from './utils'

const argv = mri<{
  template?: string
  help?: boolean
}>(process.argv.slice(2), {
  default: { help: false },
  alias: { h: 'help', t: 'template' },
  string: ['_'],
})

const cwd = process.cwd()

type ColorFunc = (str: string | number) => string

export type FrameworkVariant = {
  name: string
  display: string
  color: ColorFunc
  customCommand?: string
}

export type Framework = {
  name: string
  display: string
  color: ColorFunc
  variants: FrameworkVariant[]
}

export type Frameworks = Framework[]

export interface CreateVainaOptions {
  helpMessage: string
  frameworks: Frameworks
  renameFiles?: Record<string, string | undefined>
  defaultTargetDir?: string
  intro?: string
  relativePathTemplates?: string
  startTemplateWith?: string
}

let TEMPLATES: string[] = []

let FRAMEWORKS: Frameworks = []

export async function createVaina({
  frameworks,
  helpMessage,
  renameFiles = {},
  defaultTargetDir = 'vaina-project',
  intro,
  relativePathTemplates = '../..',
  startTemplateWith = 'template-'
}: CreateVainaOptions) {
  FRAMEWORKS = frameworks

  TEMPLATES = frameworks.map((f) => f.variants.map((v) => v.name)).reduce(
    (a, b) => a.concat(b),
    [],
  )


  const help = argv.help

  if (help) {
    console.log(helpMessage)
    return
  }

  console.log('\n')
  p.intro(intro)

  const argTargetDir = formatTargetDir(argv._[0])
  const argTemplate = argv.template

  let targetDir = argTargetDir || defaultTargetDir

  const { targetDir: targetDirPrompt, overwrite, packageName, template } = await getPropmts({ argTargetDir, defaultTargetDir, argTemplate })

  targetDir = targetDirPrompt

  const root = path.join(cwd, targetDir)

  if (overwrite === 'yes') {
    emptyDir(root)
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }

  const pm = detectSync()

  if (!pm) {
    p.log.error('Could not detect package manager')
    process.exit(1)
  }

  let { customCommand } =
    FRAMEWORKS.flatMap((f) => f.variants).find((v) => v.name === template) ?? {}

  if (customCommand) {
    customCommand = customCommand
      .replace(/^npm create /, 'create-')
      .replace(/^npm exec/, '')

    const fullCustomCommand = resolveCommand(pm.agent, 'execute', customCommand.split(' '))

    if (!fullCustomCommand) {
      p.log.error('Could not resolve custom command')
      process.exit(1)
    }

    const { args, command } = fullCustomCommand

    const replacedArgs = args.map((arg) =>
      arg.replace('TARGET_DIR', () => targetDir),
    )

    const { status } = spawn.sync(command, replacedArgs, {
      stdio: 'inherit',
    })

    process.exit(status ?? 0)
  }

  const loader = p.spinner()
  loader.start(`Scaffolding project in ${root}...`)

  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    relativePathTemplates,
    `${startTemplateWith}${template as string}`,
  )

  const write = (file: string, content?: string) => {
    const targetPath = path.join(root, renameFiles[file] ?? file)
    if (content) {
      fs.writeFileSync(targetPath, content)
    } else {
      copy(path.join(templateDir, file), targetPath)
    }
  }

  const files = fs.readdirSync(templateDir)
  for (const file of files.filter((f) => f !== 'package.json')) {
    write(file)
  }

  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateDir, `package.json`), 'utf-8'),
  )

  pkg.name = packageName

  write('package.json', JSON.stringify(pkg, null, 2) + '\n')

  loader.stop(`Scaffolding project in ${root}...`)

  const cdProjectName = path.relative(cwd, root)

  const installCommand = resolveCommand(pm.agent, 'install', [])
  const devCommand = resolveCommand(pm.agent, 'run', ['dev'])

  p.note(`${root !== cwd && `cd ${cdProjectName.includes(' ') ? `"${cdProjectName}"` : cdProjectName}`}\n${installCommand?.command} ${installCommand?.args.join(' ')}\n${devCommand?.command} ${devCommand?.args.join(' ')}`, 'Quick start:')

  p.outro(`${c.green('Done!')} Your project has been created.`)
}


async function getPropmts({
  argTargetDir,
  defaultTargetDir,
  argTemplate
}:
  {
    argTargetDir?: string,
    defaultTargetDir: string,
    argTemplate?: string
  }) {
  const targetDir = await projectNamePrompt({ argTargetDir, defaultTargetDir })
  const overwrite = await overwritePrompt({ targetDir })
  const packageName = await packageNamePrompt({ targetDir })
  const template = await templatePrompt({ argTemplate })

  return {
    targetDir,
    overwrite,
    packageName,
    template
  }
}

async function templatePrompt({ argTemplate }: { argTemplate?: string }) {
  if (argTemplate && TEMPLATES.includes(argTemplate)) {
    return argTemplate
  }

  const template = await p.select({
    message: typeof argTemplate === 'string' && !TEMPLATES.includes(argTemplate)
      ? c.reset(
        `"${argTemplate}" isn't a valid template. Please choose from below: `,
      )
      : c.reset('Select a framework:'),
    options: FRAMEWORKS.map((framework) => {
      const frameworkColor = framework.color
      return {
        label: frameworkColor(framework.display || framework.name),
        value: framework
      }
    }),
  })

  if (p.isCancel(template)) {
    cancelProcess()
  }

  const variant = await p.select({
    message: c.reset('Select a variant:'),
    options: (template as Framework).variants.map((variant) => {
      const variantColor = variant.color
      return {
        label: variantColor(variant.display || variant.name),
        value: variant.name
      }
    })
  })

  if (p.isCancel(variant)) {
    cancelProcess()
  }

  return variant
}

async function projectNamePrompt({ argTargetDir, defaultTargetDir }: { argTargetDir?: string, defaultTargetDir: string }) {
  if (argTargetDir) {
    return argTargetDir
  }

  const projectName = await p.text({
    message: c.reset('Project name:'),
    defaultValue: defaultTargetDir,
    placeholder: defaultTargetDir,
  })

  if (p.isCancel(projectName)) {
    cancelProcess()
  }

  return formatTargetDir(projectName as string) || defaultTargetDir
}

async function overwritePrompt({ targetDir }: { targetDir: string }) {
  let overwrite: 'yes' | 'ignore' | 'no' | symbol

  if (!fs.existsSync(targetDir) || isEmpty(targetDir)) {
    return
  }
  overwrite = await p.select({
    message: (targetDir === '.'
      ? 'Current directory'
      : `Target directory "${targetDir}"`) +
      ` is not empty. Please choose how to proceed:`,
    options: [
      {
        label: 'Cancel operation',
        value: 'no',
      },
      {
        label: 'Remove existing files and continue',
        value: 'yes',
      },
      {
        label: 'Ignore files and continue',
        value: 'ignore',
      },
    ],
  })

  if (p.isCancel(overwrite) || overwrite === 'no') {
    cancelProcess()
  }

  return overwrite as 'yes' | 'ignore'
}

async function packageNamePrompt({ targetDir }: { targetDir: string }) {
  const getProjectName = () => path.basename(path.resolve(targetDir))

  if (isValidPackageName(getProjectName())) {
    return getProjectName()
  }

  const packageName = await p.text({
    message: c.reset('Package name:'),
    initialValue: toValidPackageName(getProjectName()),
    placeholder: toValidPackageName(getProjectName()),
    validate: (input) => isValidPackageName(input) ? undefined : 'Invalid package.json name',
  })

  if (p.isCancel(packageName)) {
    cancelProcess()
  }

  return packageName as string
}

function cancelProcess() {
  p.cancel('Operation cancelled.');
  process.exit(0);
}
