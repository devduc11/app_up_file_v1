const { exec } = require('child_process');
const ncu = require('npm-check-updates');

const execPromise = (command) => {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
};

exports.updateNode = async () => {
    try {
        const latestNodeVersion = (await execPromise('n latest')).trim();
        console.log(`Node.js phiên bản mới nhất: ${latestNodeVersion}`);
        await execPromise(`n ${latestNodeVersion}`);
        console.log(`Cập nhật Node.js thành công!`);
    } catch (error) {
        console.error(`Lỗi trong quá trình cập nhật Node.js: ${error}`);
    }
};

exports.updateNpm = async () => {
    try {
        const upgradedPackages = await ncu.run({ upgrade: true, jsonUpgraded: true });
        const npmVersion = upgradedPackages.dependencies.npm;

        if (npmVersion) {
            console.log(`Cập nhật npm phiên bản mới nhất: ${npmVersion}`);
            await execPromise(`npm install -g npm@${npmVersion}`);
            console.log(`Cập nhật npm thành công!`);
        } else {
            console.log('Không có cập nhật cho npm.');
        }
    } catch (error) {
        console.error(`Lỗi trong quá trình kiểm tra cập nhật npm: ${error}`);
    }
};
