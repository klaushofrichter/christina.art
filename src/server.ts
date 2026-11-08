import { createApp } from './app';
import { appVersion } from './version';

const port = Number(process.env.PORT) || 8080;

createApp().listen(port, () => {
  console.log(`christina-art ${appVersion()} listening on port ${port}`);
});
