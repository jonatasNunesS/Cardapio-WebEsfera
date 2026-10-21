import type { StorybookConfig } from '@storybook/react-vite';

const configuracao: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  staticDirs: [{ from: './midia', to: '/midia' }],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  core: { disableTelemetry: true },
};

export default configuracao;
