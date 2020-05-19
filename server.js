const app = require('./lib/application')();
const argv = require('optimist').argv;

require("greenlock-express")
    .init({
        packageRoot: __dirname,

        // contact for security and critical bug notices
        configDir: "./greenlock.d",
        maintainerEmail: 'a.maimaiti@fkc-online.com',
        // whether or not to run at cloudscale
        cluster: false
    })

app.run(argv);
