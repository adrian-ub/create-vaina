import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: ['src/index.ts', 'src/cli.ts'],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: true,
  },
})
