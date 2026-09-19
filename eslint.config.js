const tseslint = require('typescript-eslint');

const browserGlobals = {
    Blob: 'readonly',
    CSS: 'readonly',
    FileReader: 'readonly',
    HTMLCollection: 'readonly',
    Image: 'readonly',
    NodeList: 'readonly',
    URL: 'readonly',
    app: 'readonly',
    atob: 'readonly',
    btoa: 'readonly',
    chrome: 'readonly',
    clearTimeout: 'readonly',
    document: 'readonly',
    escape: 'readonly',
    fetch: 'readonly',
    idbKeyval: 'readonly',
    localStorage: 'readonly',
    pell: 'readonly',
    performance: 'readonly',
    setInterval: 'readonly',
    setTimeout: 'readonly',
    unescape: 'readonly',
    window: 'readonly'
};

module.exports = [
    {
        ignores: ['.output/**', '.wxt/**', '.wxt-legacy/**', 'dist/**', 'lib/**', 'node_modules/**']
    },
    {
        files: ['*.js', 'src/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...browserGlobals,
                Buffer: 'readonly',
                __dirname: 'readonly',
                console: 'readonly',
                exports: 'writable',
                globalThis: 'readonly',
                module: 'writable',
                process: 'readonly',
                require: 'readonly'
            }
        },
        rules: {
            'no-constant-binary-expression': 'error',
            'no-dupe-args': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-func-assign': 'error',
            'no-self-assign': 'error',
            'no-unexpected-multiline': 'error',
            'no-unreachable': 'error',
            'valid-typeof': 'error'
        }
    },
    ...tseslint.configs.recommended.map(config => ({
        ...config,
        files: ['**/*.ts', '**/*.tsx']
    }))
];
