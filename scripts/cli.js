#!/usr/bin/env node

const { program } = require("commander");
const { ethers } = require("ethers");
const Table = require("cli-table3");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");

// Contract ABIs (simplified - in production, import from artifacts)
const PROCUREMENT_ABI = require("../artifacts/contracts/PublicProcurement.sol/PublicProcurement.json").abi;

// Configuration
let provider, wallet, contract;
let config = {
    rpcUrl: "http://127.0.0.1:8545",
    contractAddress: "",
    privateKey: ""
};

// Load config if exists
const configPath = path.join(__dirname, "..", ".cli-config.json");
if (fs.existsSync(configPath)) {
    config = { ...config, ...JSON.parse(fs.readFileSync(configPath, "utf8")) };
}

// Initialize connection
function initializeConnection() {
    if (!config.contractAddress) {
        console.log(chalk.red("❌ Contract address not set. Run 'cli config' first."));
        process.exit(1);
    }

    provider = new ethers.JsonRpcProvider(config.rpcUrl);

    if (config.privateKey) {
        wallet = new ethers.Wallet(config.privateKey, provider);
        contract = new ethers.Contract(config.contractAddress, PROCUREMENT_ABI, wallet);
    } else {
        contract = new ethers.Contract(config.contractAddress, PROCUREMENT_ABI, provider);
    }
}

// ============ Configuration Commands ============

program
    .command("config")
    .description("Configure CLI settings")
    .option("-r, --rpc <url>", "RPC URL")
    .option("-c, --contract <address>", "Contract address")
    .option("-k, --key <privateKey>", "Private key")
    .action((options) => {
        if (options.rpc) config.rpcUrl = options.rpc;
        if (options.contract) config.contractAddress = options.contract;
        if (options.key) config.privateKey = options.key;

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(chalk.green("✅ Configuration saved!"));
        console.log(chalk.gray(JSON.stringify(config, null, 2)));
    });

// ============ Tender Management Commands ============

program
    .command("create-tender")
    .description("Create a new tender (owner only)")
    .requiredOption("-d, --description <text>", "Tender description")
    .requiredOption("-b, --budget <eth>", "Maximum budget in ETH")
    .requiredOption("-a, --auditor <address>", "Auditor address")
    .action(async (options) => {
        initializeConnection();

        try {
            const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(options.description));
            const budgetWei = ethers.parseEther(options.budget);

            console.log(chalk.blue("📝 Creating tender..."));
            console.log(chalk.gray(`Description: ${options.description}`));
            console.log(chalk.gray(`Budget: ${options.budget} ETH`));
            console.log(chalk.gray(`Auditor: ${options.auditor}`));

            const tx = await contract.createTender(descriptionHash, budgetWei, options.auditor);
            console.log(chalk.yellow(`⏳ Transaction sent: ${tx.hash}`));

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return contract.interface.parseLog(log).name === "TenderCreated";
                } catch {
                    return false;
                }
            });

            if (event) {
                const parsed = contract.interface.parseLog(event);
                console.log(chalk.green(`✅ Tender created! ID: ${parsed.args[0]}`));
            }

            console.log(chalk.gray(`Gas used: ${receipt.gasUsed.toString()}`));
        } catch (error) {
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
    });

program
    .command("get-tender")
    .description("Get tender information")
    .requiredOption("-i, --id <tenderId>", "Tender ID")
    .action(async (options) => {
        initializeConnection();

        try {
            const tender = await contract.getTender(options.id);
            const stateName = await contract.getStateName(options.id);

            const table = new Table({
                head: [chalk.cyan("Field"), chalk.cyan("Value")],
                colWidths: [25, 55]
            });

            table.push(
                ["ID", tender.id.toString()],
                ["Description Hash", tender.descriptionHash],
                ["Max Budget", ethers.formatEther(tender.maxBudget) + " ETH"],
                ["Submission Deadline", new Date(Number(tender.submissionDeadline) * 1000).toLocaleString()],
                ["Reveal Deadline", new Date(Number(tender.revealDeadline) * 1000).toLocaleString()],
                ["Owner", tender.owner],
                ["State", chalk.yellow(stateName)],
                ["Winner", tender.winner || "Not selected"],
                ["Winning Bid", tender.winningBid > 0 ? ethers.formatEther(tender.winningBid) + " ETH" : "N/A"],
                ["Current Milestone", `${tender.currentMilestone} / ${tender.totalMilestones}`],
                ["Auditor", tender.auditor]
            );

            console.log(table.toString());
        } catch (error) {
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
    });

program
    .command("list-tenders")
    .description("List all tenders")
    .action(async () => {
        initializeConnection();

        try {
            const tenderCount = await contract.tenderCounter();

            const table = new Table({
                head: [chalk.cyan("ID"), chalk.cyan("Budget (ETH)"), chalk.cyan("State"), chalk.cyan("Winner")],
                colWidths: [8, 15, 20, 45]
            });

            for (let i = 1; i <= tenderCount; i++) {
                const tender = await contract.getTender(i);
                const stateName = await contract.getStateName(i);

                table.push([
                    i.toString(),
                    ethers.formatEther(tender.maxBudget),
                    stateName,
                    tender.winner || "N/A"
                ]);
            }

            console.log(table.toString());
        } catch (error) {
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
    });

// ============ Bid Management Commands ============

program
    .command("submit-bid")
    .description("Submit a bid commitment")
    .requiredOption("-i, --id <tenderId>", "Tender ID")
    .requiredOption("-a, --amount <eth>", "Bid amount in ETH")
    .option("-n, --nonce <nonce>", "Nonce (random bytes32, auto-generated if not provided)")
    .action(async (options) => {
        initializeConnection();

        try {
            const amount = ethers.parseEther(options.amount);
            const nonce = options.nonce || ethers.hexlify(ethers.randomBytes(32));
            const bidderAddress = await wallet.getAddress();

            // Generate commit hash
            const commitHash = ethers.keccak256(
                ethers.solidityPacked(
                    ["uint256", "bytes32", "address"],
                    [amount, nonce, bidderAddress]
                )
            );

            console.log(chalk.blue("📝 Submitting bid..."));
            console.log(chalk.gray(`Tender ID: ${options.id}`));
            console.log(chalk.gray(`Amount: ${options.amount} ETH`));
            console.log(chalk.yellow(`⚠️  SAVE THIS NONCE: ${nonce}`));
            console.log(chalk.gray(`Commit Hash: ${commitHash}`));

            const tx = await contract.submitBid(options.id, commitHash);
            console.log(chalk.yellow(`⏳ Transaction sent: ${tx.hash}`));

            const receipt = await tx.wait();
            console.log(chalk.green("✅ Bid submitted successfully!"));

            // Save bid info locally
            const bidInfo = {
                tenderId: options.id,
                amount: options.amount,
                nonce: nonce,
                commitHash: commitHash,
                timestamp: new Date().toISOString()
            };

            const bidsFile = path.join(__dirname, "..", ".my-bids.json");
            let bids = [];
            if (fs.existsSync(bidsFile)) {
                bids = JSON.parse(fs.readFileSync(bidsFile, "utf8"));
            }
            bids.push(bidInfo);
            fs.writeFileSync(bidsFile, JSON.stringify(bids, null, 2));

            console.log(chalk.green("💾 Bid info saved locally"));
        } catch (error) {
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
    });

program
    .command("reveal-bid")
    .description("Reveal a previously submitted bid")
    .requiredOption("-i, --id <tenderId>", "Tender ID")
    .requiredOption("-a, --amount <eth>", "Bid amount in ETH")
    .requiredOption("-n, --nonce <nonce>", "Nonce used in commit")
    .action(async (options) => {
        initializeConnection();

        try {
            const amount = ethers.parseEther(options.amount);

            console.log(chalk.blue("🔓 Revealing bid..."));
            console.log(chalk.gray(`Tender ID: ${options.id}`));
            console.log(chalk.gray(`Amount: ${options.amount} ETH`));

            const tx = await contract.revealBid(options.id, amount, options.nonce);
            console.log(chalk.yellow(`⏳ Transaction sent: ${tx.hash}`));

            const receipt = await tx.wait();
            console.log(chalk.green("✅ Bid revealed successfully!"));
            console.log(chalk.gray(`Gas used: ${receipt.gasUsed.toString()}`));
        } catch (error) {
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
    });

program
    .command("get-bid")
    .description("Get bid status")
    .requiredOption("-i, --id <tenderId>", "Tender ID")
    .requiredOption("-b, --bidder <address>", "Bidder address")
    .action(async (options) => {
        initializeConnection();

        try {
            const bid = await contract.getBid(options.id, options.bidder);

            const table = new Table({
                head: [chalk.cyan("Field"), chalk.cyan("Value")],
                colWidths: [20, 60]
            });

            table.push(
                ["Bidder", bid.bidder],
                ["Commit Hash", bid.commitHash],
                ["Revealed", bid.revealed ? chalk.green("Yes") : chalk.red("No")],
                ["Revealed Amount", bid.revealed ? ethers.formatEther(bid.revealedAmount) + " ETH" : "N/A"],
                ["Valid", bid.valid ? chalk.green("Yes") : chalk.red("No")]
            );

            console.log(table.toString());
        } catch (error) {
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
    });

program
    .command("my-bids")
    .description("Show my saved bids")
    .action(() => {
        const bidsFile = path.join(__dirname, "..", ".my-bids.json");

        if (!fs.existsSync(bidsFile)) {
            console.log(chalk.yellow("No saved bids found"));
            return;
        }

        const bids = JSON.parse(fs.readFileSync(bidsFile, "utf8"));

        const table = new Table({
            head: [chalk.cyan("Tender ID"), chalk.cyan("Amount (ETH)"), chalk.cyan("Nonce"), chalk.cyan("Date")],
            colWidths: [12, 15, 70, 25]
        });

        bids.forEach(bid => {
            table.push([
                bid.tenderId,
                bid.amount,
                bid.nonce,
                new Date(bid.timestamp).toLocaleString()
            ]);
        });

        console.log(table.toString());
    });

// ============ Winner Selection ============

program
    .command("select-winner")
    .description("Select the winner for a tender")
    .requiredOption("-i, --id <tenderId>", "Tender ID")
    .action(async (options) => {
        initializeConnection();

        try {
            console.log(chalk.blue("🏆 Selecting winner..."));

            const tx = await contract.selectWinner(options.id);
            console.log(chalk.yellow(`⏳ Transaction sent: ${tx.hash}`));

            const receipt = await tx.wait();

            // Find WinnerSelected event
            const event = receipt.logs.find(log => {
                try {
                    return contract.interface.parseLog(log).name === "WinnerSelected";
                } catch {
                    return false;
                }
            });

            if (event) {
                const parsed = contract.interface.parseLog(event);
                console.log(chalk.green("✅ Winner selected!"));
                console.log(chalk.green(`🏆 Winner: ${parsed.args.winner}`));
                console.log(chalk.green(`💰 Winning bid: ${ethers.formatEther(parsed.args.amount)} ETH`));
            } else {
                console.log(chalk.yellow("⚠️  No winner selected (tender may be cancelled)"));
            }
        } catch (error) {
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
    });

// ============ Milestone Management ============

program
    .command("approve-milestone")
    .description("Approve a milestone (auditor only)")
    .requiredOption("-i, --id <tenderId>", "Tender ID")
    .requiredOption("-m, --milestone <number>", "Milestone number")
    .requiredOption("-p, --payment <eth>", "Payment amount in ETH")
    .action(async (options) => {
        initializeConnection();

        try {
            const payment = ethers.parseEther(options.payment);

            console.log(chalk.blue("✅ Approving milestone..."));
            console.log(chalk.gray(`Tender ID: ${options.id}`));
            console.log(chalk.gray(`Milestone: ${options.milestone}`));
            console.log(chalk.gray(`Payment: ${options.payment} ETH`));

            const tx = await contract.approveMilestone(options.id, options.milestone, { value: payment });
            console.log(chalk.yellow(`⏳ Transaction sent: ${tx.hash}`));

            const receipt = await tx.wait();
            console.log(chalk.green("✅ Milestone approved and payment sent!"));
            console.log(chalk.gray(`Gas used: ${receipt.gasUsed.toString()}`));
        } catch (error) {
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
    });

program
    .command("milestone-status")
    .description("Get milestone status")
    .requiredOption("-i, --id <tenderId>", "Tender ID")
    .action(async (options) => {
        initializeConnection();

        try {
            const tender = await contract.getTender(options.id);

            const table = new Table({
                head: [chalk.cyan("Milestone"), chalk.cyan("Status")],
                colWidths: [15, 20]
            });

            for (let i = 1; i <= tender.totalMilestones; i++) {
                const completed = await contract.isMilestoneCompleted(options.id, i);
                table.push([
                    `Milestone ${i}`,
                    completed ? chalk.green("✅ Completed") : chalk.yellow("⏳ Pending")
                ]);
            }

            console.log(table.toString());
            console.log(chalk.gray(`Current: ${tender.currentMilestone} / ${tender.totalMilestones}`));
        } catch (error) {
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
    });

// ============ Utility Commands ============

program
    .command("verify-hash")
    .description("Verify a bid commitment hash")
    .requiredOption("-a, --amount <eth>", "Bid amount in ETH")
    .requiredOption("-n, --nonce <nonce>", "Nonce")
    .requiredOption("-b, --bidder <address>", "Bidder address")
    .action((options) => {
        const amount = ethers.parseEther(options.amount);
        const hash = ethers.keccak256(
            ethers.solidityPacked(
                ["uint256", "bytes32", "address"],
                [amount, options.nonce, options.bidder]
            )
        );

        console.log(chalk.green("Computed Hash:"), hash);
    });

program
    .command("get-events")
    .description("Get all events for a tender")
    .requiredOption("-i, --id <tenderId>", "Tender ID")
    .action(async (options) => {
        initializeConnection();

        try {
            console.log(chalk.blue("📋 Fetching events..."));

            const filter = contract.filters.TenderCreated(options.id);
            const events = await contract.queryFilter(filter);

            console.log(chalk.green(`Found ${events.length} events`));

            events.forEach((event, index) => {
                console.log(chalk.gray(`\nEvent ${index + 1}:`));
                console.log(chalk.gray(JSON.stringify(event.args, null, 2)));
            });
        } catch (error) {
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
    });

// Parse and execute
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
