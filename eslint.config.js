import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', '.worktrees/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['src/features/rentenluecke/model/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../components',
                '../components/**',
                '../hooks',
                '../hooks/**',
                '../charting',
                '../charting/**',
                '../mortality',
                '../mortality/**',
                '../../components',
                '../../components/**',
                '../../hooks',
                '../../hooks/**',
                '../../charting',
                '../../charting/**',
                '../../mortality',
                '../../mortality/**',
              ],
              message:
                'model/ must stay framework-free: it may not import from sibling UI zones (components/, hooks/, charting/) or mortality/. Import model from the outer layers instead.',
            },
            {
              group: ['../../**', '../../../**', '../../../../**'],
              message:
                'model/ may only import from within model/ (plus external packages): relative imports climbing above model/ always leave the engine.',
            },
            {
              group: [
                '**/rentenluecke/components/**',
                '**/rentenluecke/hooks/**',
                '**/rentenluecke/charting/**',
                '**/rentenluecke/mortality/**',
                '**/shared/**',
              ],
              message:
                'model/ must stay framework-free: it may only import from within model/ (plus external packages).',
            },
          ],
        },
      ],
    },
  },
)
