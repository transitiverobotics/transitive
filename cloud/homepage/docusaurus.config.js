// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const path = require('path')

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').Config} */
const config = {
  customFields: {
    isDevelopment: process.env.npm_command == 'start'
  },
  title: 'Transitive Robotics',
  tagline: 'Full-stack robotic capabilities',
  url: 'https://transitiverobotics.com',
  baseUrl: '/',
  // onBrokenLinks: 'throw',
  onBrokenLinks: 'error',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'transitiverobotics', // Usually your GitHub org/user name.
  projectName: 'transitiverobotics', // Usually your repo name.

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
        },
        blog: {
          showReadingTime: true,
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
        gtag: {
          trackingID: 'G-E14WHWWP9L',
          anonymizeIP: true,
        },
      }),
    ],
  ],

  plugins: [
    [ path.resolve(__dirname, 'plugin-dynamic-routes'),
      { // this is the options object passed to the plugin
        routes: [{ // using Route schema from react-router
          path: '/caps/:scope/:name',
          exact: false,
          component: '@site/src/components/Capability'
        }]
      }
    ],
  ],

  themeConfig:
  /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
  ({
    navbar: {
      title: 'Transitive Robotics',
      logo: {
        alt: 'TR logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'doc',
          docId: 'documentation',
          position: 'left',
          label: 'Documentation',
        },
        {to: '/caps', label: 'Capabilities', position: 'left'},
        {to: '/blog', label: 'Blog', position: 'left'},
        {
          href: 'https://portal.transitiverobotics.com',
          label: 'Portal',
          position: 'left',
        },
        {
          href: 'https://github.com/transitiverobotics',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Documentation',
              to: '/docs/documentation',
            },
            {
              label: 'Demo',
              to: '/demo',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            // {
            //   label: 'Stack Overflow',
            //   href: 'https://stackoverflow.com/questions/tagged/transitive',
            // },
            // {
            //   label: 'Discord',
            //   href: 'https://discordapp.com/invite/docusaurus',
            // },
            {
              label: 'Twitter',
              href: 'https://twitter.com/transitiverob',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: '/blog',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/transitiverobotics',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Transitive Robotics. <a href='/terms'>Terms of Service</a>.`
    },
    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
    },
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
  }),
};

module.exports = config;
