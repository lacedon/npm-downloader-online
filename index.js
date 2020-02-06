const fs = require('fs');
const util = require('util');
const cp = require('child_process');
const fsExtra = require('fs-extra');
const Koa = require('koa');
const { zip } = require('zip-a-folder');
const ffp = require('find-free-port');

(async () => {
  const readFile = util.promisify(fs.readFile);
  const createDir = util.promisify(fs.mkdir);
  const getStat = util.promisify(fs.stat);
  const execChildProcess = util.promisify(cp.exec);
  const findFreePort = util.promisify(ffp);
  const tempFolderPath = './temp';

  const [port, front] = await Promise.all([
    findFreePort(process.env.PORT || 3000),
    readFile('./index.html'),
    async () => {
      try {
        await getStat(tempFolderPath)
      } catch (error) {
        return createDir(tempFolderPath)
      }
    },
  ]);

  return new Koa()
    .use(async function loadFile(ctx, next) {
      if (!ctx.query.p) {
        next();
        return;
      }

      const rawPackageName = ctx.query.p.replace(/&|/, '');
      const packageName = rawPackageName.replace(/\W/, '_');
      const folderName = `${Date.now()}-${packageName}`;
      const folderPath = `${tempFolderPath}/${folderName}`;
      const archiveName = 'modules.zip';
      const archivePath = `${folderPath}/${archiveName}`;

      try {
        await createDir(folderPath);

        const initProcess = await execChildProcess('npm init -y', { cwd: folderPath });
        initProcess.kill();

        const installProcess = await execChildProcess(`npm i ${rawPackageName} --ignore-scripts`, {
          cwd: folderPath
        });
        installProcess.kill();

        await zip(`${folderPath}/node_modules`, archivePath);
        const readFileStream = fs.createReadStream(archivePath);

        ctx.status = 200;
        ctx.type = 'application/zip';
        ctx.set('Content-Disposition', `attachment; filename="${packageName}.zip"`);
        ctx.body = readFileStream;
      } catch (error) {
        console.error('Error happen during the creating module', error);
        ctx.state.error = 'Error happen during the creating module. Please try late.';
      }

      try {
        await fsExtra.remove(folderPath);
      } catch (error) {
        console.warn('Error happen during removing temp folder', error);
      }

      next();
    })
    .use(function returnStatic(ctx, next) {
      if (!ctx.body) {
        ctx.status = ctx.state.error ? 400 : 200;
        ctx.body = front.toString();
      }
      next();
    })
    .use(async function logRequest(ctx, next) {
      console.info([
        'req',
        ctx.response.status,
        ctx.request.method,
        [ctx.request.path, ctx.request.querystring].filter(Boolean).join('?')
      ].join('\t'));
      next();
    })
    .listen(port, () => console.log(`listen to ${port}`));
})();
