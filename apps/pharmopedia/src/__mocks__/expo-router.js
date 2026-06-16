const React = require('react')
const noopRouter = { push: () => {}, replace: () => {}, back: () => {}, navigate: () => {}, setParams: () => {} }
module.exports = {
  useRouter: () => noopRouter,
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  useSegments: () => [],
  Link: ({ children }) => React.createElement('Link', null, children),
  Redirect: () => null,
  Stack: Object.assign(({ children }) => React.createElement('Stack', null, children), { Screen: () => null }),
  Tabs: Object.assign(({ children }) => React.createElement('Tabs', null, children), { Screen: () => null }),
  router: noopRouter,
}
