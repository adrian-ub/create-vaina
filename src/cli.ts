import colors from 'picocolors'

import { createVaina } from '.'
import pkgJson from '../package.json'

const {
  blue,
  green,
  yellow,
  dim,
} = colors

const frameworks = [
  {
    name: 'vite',
    display: 'Vite',
    color: yellow,
    variants: [
      {
        name: 'vite-ts',
        display: 'TypeScript',
        color: blue,
      },
      {
        name: 'vite',
        display: 'JavaScript',
        color: yellow,
      },
    ],
  },
]

const helpMessage = `\
Usage: create-vaina [OPTION]... [DIRECTORY]

Create a new Project project in JavaScript or TypeScript.
With no arguments, start the CLI in interactive mode.

Options:
  -t, --template NAME        use a specific template

Available templates:
${yellow('vite-ts     vite')}
`

createVaina({
  frameworks,
  helpMessage,
  intro: `${green(`${pkgJson.name} `)}${dim(`v${pkgJson.version}`)}`,
  renameFiles: {
    _gitignore: '.gitignore',
  },
}).catch((e) => {
  console.error(e)
})
