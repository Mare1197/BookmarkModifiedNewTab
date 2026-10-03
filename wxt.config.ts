import {defineConfig} from 'wxt';

export default defineConfig({
    modules: ['@wxt-dev/module-react'],
    publicDir: '.wxt-legacy',
    // BlockSuite resolves constructor-based services by their runtime names.
    vite: () => ({build: {rolldownOptions: {output: {keepNames: true}}}}),
    manifest: {
        name: 'Browser OS New Tab',
        description: 'A local-first browser workspace and bookmark desktop.',
        // Bundled BlockSuite syntax highlighting uses local WebAssembly, not JS eval.
        content_security_policy: {extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"},
        permissions: ['activeTab', 'alarms', 'bookmarks', 'favicon', 'history', 'notifications', 'storage', 'tabs'],
        optional_permissions: ['scripting'],
        optional_host_permissions: ['<all_urls>', 'https://generativelanguage.googleapis.com/*'],
        action: {
            default_popup: 'popup.html',
            default_title: 'Capture visible tab to Browser OS'
        },
        icons: {
            16: 'legacy/icons/icon16.png',
            48: 'legacy/icons/icon48.png',
            128: 'legacy/icons/icon128.png'
        },
        minimum_chrome_version: '104'
    }
});
