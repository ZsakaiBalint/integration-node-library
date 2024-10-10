module.exports = {
    env: {
      es2022: true,
      node: true,
    },
    
    parser: '@typescript-eslint/parser',
  
    plugins: ['@typescript-eslint', 'prettier'],
  
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'prettier',
    ],

    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  
    ignores: [
      'node_modules/',
      'dist/',
      '*.js',
      '**/*.js',
    ],
  
    parserOptions: {
      project: './tsconfig.json',
      sourceType: 'module',
    },
  };
  