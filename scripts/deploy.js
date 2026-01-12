const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🚀 Starting deployment...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

    // Deploy Vulnerable Version
    console.log("📝 Deploying PublicProcurement (Vulnerable Version)...");
    const PublicProcurement = await hre.ethers.getContractFactory("PublicProcurement");
    const publicProcurement = await PublicProcurement.deploy();
    await publicProcurement.waitForDeployment();
    const vulnerableAddress = await publicProcurement.getAddress();
    console.log("✅ PublicProcurement deployed to:", vulnerableAddress);

    // Deploy Secure Version
    console.log("\n📝 Deploying PublicProcurementSecure (Secure Version)...");
    const PublicProcurementSecure = await hre.ethers.getContractFactory("PublicProcurementSecure");
    const publicProcurementSecure = await PublicProcurementSecure.deploy();
    await publicProcurementSecure.waitForDeployment();
    const secureAddress = await publicProcurementSecure.getAddress();
    console.log("✅ PublicProcurementSecure deployed to:", secureAddress);

    // Save deployment info
    const deploymentInfo = {
        network: hre.network.name,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {
            PublicProcurement: {
                address: vulnerableAddress,
                version: "vulnerable",
                description: "Contains intentional vulnerabilities for educational purposes"
            },
            PublicProcurementSecure: {
                address: secureAddress,
                version: "secure",
                description: "Secure version with OpenZeppelin guards and best practices"
            }
        }
    };

    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir);
    }

    const filename = `${hre.network.name}-${Date.now()}.json`;
    fs.writeFileSync(
        path.join(deploymentsDir, filename),
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("\n📄 Deployment info saved to:", filename);

    // Display summary
    console.log("\n" + "=".repeat(60));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log("Network:", hre.network.name);
    console.log("Deployer:", deployer.address);
    console.log("\nVulnerable Contract:", vulnerableAddress);
    console.log("Secure Contract:", secureAddress);
    console.log("=".repeat(60));

    // If on testnet, provide verification command
    if (hre.network.name === "sepolia") {
        console.log("\n📋 To verify contracts on Etherscan, run:");
        console.log(`npx hardhat verify --network sepolia ${vulnerableAddress}`);
        console.log(`npx hardhat verify --network sepolia ${secureAddress}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
