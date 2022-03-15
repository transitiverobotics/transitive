// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

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
          // Please change this to your repo.
          // editUrl: 'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          // editUrl:
          // 'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
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
        {to: '/blog', label: 'Blog', position: 'left'},
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
      // copyright: `Copyright © ${new Date().getFullYear()} Transitive Robotics. Built with Docusaurus.`,
      copyright: `Copyright © ${new Date().getFullYear()} Transitive Robotics.
      Icon credits:
      delivery robot by iconcheese,
      industrial robot by Dooder,
      dashboard by LAFS, and
      drone by Soremba from <a
      href="https://thenounproject.com/">The Noun Project</a>.`
    },
    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
    },
  }),
};

module.exports = config;
