const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function deploy() {
    try {
        console.log("Connecting to Hostinger VPS...");
        await ssh.connect({
            host: '93.127.208.17',
            username: 'u538055792',
            password: 'Alchemetryx00??',
            port: 65002 // Hostinger specific port
        });
        console.log("Connected securely!");

        // Check user identity
        const whoami = await ssh.execCommand('whoami');
        console.log(`Logged in as: ${whoami.stdout}`);

        // Check if we can use sudo
        console.log("Checking sudo privileges...");
        const sudoCheck = await ssh.execCommand('sudo -n true');
        if (sudoCheck.code !== 0) {
            console.log(`Sudo check failed or requires password: ${sudoCheck.stderr}`);
            // Let's test if password works for sudo
            const sudoTest = await ssh.execCommand('echo "Alchemetryx00??" | sudo -S grep "PRETTY_NAME" /etc/os-release');
            console.log("Sudo OS test:", sudoTest.stdout || sudoTest.stderr);

            if (sudoTest.code !== 0 && whoami.stdout !== 'root') {
                console.error("CRITICAL: Root or sudo privileges are required to install Docker, configure UFW, and run Fail2Ban.");
                console.error("It appears this might be a Hostinger Shared Hosting or restricted account (u538055792) rather than a KVM VPS root account.");
            }
        } else {
            console.log("Sudo privileges confirmed.");
        }

        // Check for Docker
        const dockerCheck = await ssh.execCommand('docker --version');
        console.log(`Docker status: ${dockerCheck.stdout || dockerCheck.stderr || 'Not installed'}`);

        // Check for Git
        const gitCheck = await ssh.execCommand('git --version');
        console.log(`Git status: ${gitCheck.stdout || gitCheck.stderr || 'Not installed'}`);

    } catch (err) {
        console.error("Deployment Error:", err.message);
    } finally {
        ssh.dispose();
    }
}

deploy();
