const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("PublicProcurement - Complete Workflow", function () {
    let publicProcurement;
    let owner, auditor, bidder1, bidder2, bidder3, other;

    const MAX_BUDGET = ethers.parseEther("12");
    const DESCRIPTION_HASH = ethers.keccak256(ethers.toUtf8Bytes("Road Construction Project"));

    beforeEach(async function () {
        [owner, auditor, bidder1, bidder2, bidder3, other] = await ethers.getSigners();

        const PublicProcurement = await ethers.getContractFactory("PublicProcurement");
        publicProcurement = await PublicProcurement.deploy();
        await publicProcurement.waitForDeployment();
    });

    describe("Phase 1: Tender Creation", function () {
        it("Should create a tender successfully", async function () {
            const tx = await publicProcurement.createTender(
                DESCRIPTION_HASH,
                MAX_BUDGET,
                auditor.address
            );

            await expect(tx)
                .to.emit(publicProcurement, "TenderCreated")
                .withArgs(1, DESCRIPTION_HASH, MAX_BUDGET, await time.latest() + 2 * 24 * 60 * 60, await time.latest() + 3 * 24 * 60 * 60);

            const tender = await publicProcurement.getTender(1);
            expect(tender.id).to.equal(1);
            expect(tender.descriptionHash).to.equal(DESCRIPTION_HASH);
            expect(tender.maxBudget).to.equal(MAX_BUDGET);
            expect(tender.auditor).to.equal(auditor.address);
            expect(tender.state).to.equal(1); // Bidding state
        });

        it("Should only allow owner to create tender", async function () {
            await expect(
                publicProcurement.connect(bidder1).createTender(
                    DESCRIPTION_HASH,
                    MAX_BUDGET,
                    auditor.address
                )
            ).to.be.revertedWith("Only contract owner can call this");
        });

        it("Should reject zero budget", async function () {
            await expect(
                publicProcurement.createTender(DESCRIPTION_HASH, 0, auditor.address)
            ).to.be.revertedWith("Budget must be greater than 0");
        });
    });

    describe("Phase 2: Bid Submission (Commit)", function () {
        let tenderId;

        beforeEach(async function () {
            const tx = await publicProcurement.createTender(
                DESCRIPTION_HASH,
                MAX_BUDGET,
                auditor.address
            );
            const receipt = await tx.wait();
            tenderId = 1;
        });

        it("Should submit bid commitment successfully", async function () {
            const amount = ethers.parseEther("8");
            const nonce = ethers.randomBytes(32);
            const commitHash = ethers.keccak256(
                ethers.solidityPacked(
                    ["uint256", "bytes32", "address"],
                    [amount, nonce, bidder1.address]
                )
            );

            await expect(publicProcurement.connect(bidder1).submitBid(tenderId, commitHash))
                .to.emit(publicProcurement, "BidSubmitted")
                .withArgs(tenderId, bidder1.address, commitHash);

            const bid = await publicProcurement.getBid(tenderId, bidder1.address);
            expect(bid.commitHash).to.equal(commitHash);
            expect(bid.revealed).to.be.false;
        });

        it("Should prevent double submission", async function () {
            const amount = ethers.parseEther("8");
            const nonce = ethers.randomBytes(32);
            const commitHash = ethers.keccak256(
                ethers.solidityPacked(
                    ["uint256", "bytes32", "address"],
                    [amount, nonce, bidder1.address]
                )
            );

            await publicProcurement.connect(bidder1).submitBid(tenderId, commitHash);

            await expect(
                publicProcurement.connect(bidder1).submitBid(tenderId, commitHash)
            ).to.be.revertedWith("Bid already submitted");
        });

        it("Should reject submission after deadline", async function () {
            const tender = await publicProcurement.getTender(tenderId);
            await time.increaseTo(tender.submissionDeadline + 1n);

            const amount = ethers.parseEther("8");
            const nonce = ethers.randomBytes(32);
            const commitHash = ethers.keccak256(
                ethers.solidityPacked(
                    ["uint256", "bytes32", "address"],
                    [amount, nonce, bidder1.address]
                )
            );

            await expect(
                publicProcurement.connect(bidder1).submitBid(tenderId, commitHash)
            ).to.be.revertedWith("Deadline has passed");
        });
    });

    describe("Phase 3: Bid Revelation", function () {
        let tenderId;
        let bid1Amount, bid1Nonce, bid1Hash;
        let bid2Amount, bid2Nonce, bid2Hash;
        let bid3Amount, bid3Nonce, bid3Hash;

        beforeEach(async function () {
            await publicProcurement.createTender(DESCRIPTION_HASH, MAX_BUDGET, auditor.address);
            tenderId = 1;

            // Bidder 1: 8 ETH (should win)
            bid1Amount = ethers.parseEther("8");
            bid1Nonce = ethers.randomBytes(32);
            bid1Hash = ethers.keccak256(
                ethers.solidityPacked(["uint256", "bytes32", "address"], [bid1Amount, bid1Nonce, bidder1.address])
            );

            // Bidder 2: 11 ETH
            bid2Amount = ethers.parseEther("11");
            bid2Nonce = ethers.randomBytes(32);
            bid2Hash = ethers.keccak256(
                ethers.solidityPacked(["uint256", "bytes32", "address"], [bid2Amount, bid2Nonce, bidder2.address])
            );

            // Bidder 3: 10 ETH
            bid3Amount = ethers.parseEther("10");
            bid3Nonce = ethers.randomBytes(32);
            bid3Hash = ethers.keccak256(
                ethers.solidityPacked(["uint256", "bytes32", "address"], [bid3Amount, bid3Nonce, bidder3.address])
            );

            await publicProcurement.connect(bidder1).submitBid(tenderId, bid1Hash);
            await publicProcurement.connect(bidder2).submitBid(tenderId, bid2Hash);
            await publicProcurement.connect(bidder3).submitBid(tenderId, bid3Hash);

            // Move past submission deadline
            const tender = await publicProcurement.getTender(tenderId);
            await time.increaseTo(tender.submissionDeadline + 1n);
        });

        it("Should reveal bid successfully", async function () {
            await expect(
                publicProcurement.connect(bidder1).revealBid(tenderId, bid1Amount, bid1Nonce)
            )
                .to.emit(publicProcurement, "BidRevealed")
                .withArgs(tenderId, bidder1.address, bid1Amount, true);

            const bid = await publicProcurement.getBid(tenderId, bidder1.address);
            expect(bid.revealed).to.be.true;
            expect(bid.revealedAmount).to.equal(bid1Amount);
            expect(bid.valid).to.be.true;
        });

        it("Should reject invalid hash reveal", async function () {
            const wrongAmount = ethers.parseEther("7");

            await expect(
                publicProcurement.connect(bidder1).revealBid(tenderId, wrongAmount, bid1Nonce)
            ).to.be.revertedWith("Invalid reveal: hash mismatch");
        });

        it("Should mark bid as invalid if over budget", async function () {
            // Create a fresh tender for this test
            await publicProcurement.createTender(DESCRIPTION_HASH, MAX_BUDGET, auditor.address);
            const newTenderId = 2;

            const overBudgetAmount = ethers.parseEther("13");
            const nonce = ethers.randomBytes(32);
            const hash = ethers.keccak256(
                ethers.solidityPacked(["uint256", "bytes32", "address"], [overBudgetAmount, nonce, other.address])
            );

            await publicProcurement.connect(other).submitBid(newTenderId, hash);
            const tender = await publicProcurement.getTender(newTenderId);
            await time.increaseTo(tender.submissionDeadline + 1n);

            await expect(
                publicProcurement.connect(other).revealBid(newTenderId, overBudgetAmount, nonce)
            )
                .to.emit(publicProcurement, "BidRevealed")
                .withArgs(newTenderId, other.address, overBudgetAmount, false);

            const bid = await publicProcurement.getBid(newTenderId, other.address);
            expect(bid.valid).to.be.false;
        });

        it("Should reject reveal after deadline", async function () {
            const tender = await publicProcurement.getTender(tenderId);
            await time.increaseTo(tender.revealDeadline + 1n);

            await expect(
                publicProcurement.connect(bidder1).revealBid(tenderId, bid1Amount, bid1Nonce)
            ).to.be.revertedWith("Reveal deadline has passed");
        });
    });

    describe("Phase 4: Winner Selection", function () {
        let tenderId;
        let bid1Amount, bid1Nonce, bid1Hash;
        let bid2Amount, bid2Nonce, bid2Hash;
        let bid3Amount, bid3Nonce, bid3Hash;

        beforeEach(async function () {
            await publicProcurement.createTender(DESCRIPTION_HASH, MAX_BUDGET, auditor.address);
            tenderId = 1;

            bid1Amount = ethers.parseEther("8");
            bid1Nonce = ethers.randomBytes(32);
            bid1Hash = ethers.keccak256(
                ethers.solidityPacked(["uint256", "bytes32", "address"], [bid1Amount, bid1Nonce, bidder1.address])
            );

            bid2Amount = ethers.parseEther("11");
            bid2Nonce = ethers.randomBytes(32);
            bid2Hash = ethers.keccak256(
                ethers.solidityPacked(["uint256", "bytes32", "address"], [bid2Amount, bid2Nonce, bidder2.address])
            );

            bid3Amount = ethers.parseEther("10");
            bid3Nonce = ethers.randomBytes(32);
            bid3Hash = ethers.keccak256(
                ethers.solidityPacked(["uint256", "bytes32", "address"], [bid3Amount, bid3Nonce, bidder3.address])
            );

            await publicProcurement.connect(bidder1).submitBid(tenderId, bid1Hash);
            await publicProcurement.connect(bidder2).submitBid(tenderId, bid2Hash);
            await publicProcurement.connect(bidder3).submitBid(tenderId, bid3Hash);

            const tender = await publicProcurement.getTender(tenderId);
            await time.increaseTo(tender.submissionDeadline + 1n);

            await publicProcurement.connect(bidder1).revealBid(tenderId, bid1Amount, bid1Nonce);
            await publicProcurement.connect(bidder2).revealBid(tenderId, bid2Amount, bid2Nonce);
            await publicProcurement.connect(bidder3).revealBid(tenderId, bid3Amount, bid3Nonce);

            await time.increaseTo(tender.revealDeadline + 1n);
        });

        it("Should select lowest bidder as winner", async function () {
            await expect(publicProcurement.selectWinner(tenderId))
                .to.emit(publicProcurement, "WinnerSelected")
                .withArgs(tenderId, bidder1.address, bid1Amount);

            const tender = await publicProcurement.getTender(tenderId);
            expect(tender.winner).to.equal(bidder1.address);
            expect(tender.winningBid).to.equal(bid1Amount);
            expect(tender.state).to.equal(3); // WinnerSelected
        });

        it("Should cancel tender if no valid bids", async function () {
            // Create new tender
            await publicProcurement.createTender(DESCRIPTION_HASH, MAX_BUDGET, auditor.address);
            const newTenderId = 2;

            const tender = await publicProcurement.getTender(newTenderId);
            await time.increaseTo(tender.revealDeadline + 1n);

            await expect(publicProcurement.selectWinner(newTenderId))
                .to.emit(publicProcurement, "TenderCancelled")
                .withArgs(newTenderId, "No valid bids");

            const updatedTender = await publicProcurement.getTender(newTenderId);
            expect(updatedTender.state).to.equal(6); // Cancelled
        });
    });

    describe("Phase 5: Milestone Payments", function () {
        let tenderId;
        let winningBid;

        beforeEach(async function () {
            await publicProcurement.createTender(DESCRIPTION_HASH, MAX_BUDGET, auditor.address);
            tenderId = 1;

            winningBid = ethers.parseEther("8");
            const nonce = ethers.randomBytes(32);
            const hash = ethers.keccak256(
                ethers.solidityPacked(["uint256", "bytes32", "address"], [winningBid, nonce, bidder1.address])
            );

            await publicProcurement.connect(bidder1).submitBid(tenderId, hash);

            const tender = await publicProcurement.getTender(tenderId);
            await time.increaseTo(tender.submissionDeadline + 1n);

            await publicProcurement.connect(bidder1).revealBid(tenderId, winningBid, nonce);

            await time.increaseTo(tender.revealDeadline + 1n);
            await publicProcurement.selectWinner(tenderId);
        });

        it("Should approve milestone and transfer payment", async function () {
            const milestonePayment = winningBid / 2n;
            const initialBalance = await ethers.provider.getBalance(bidder1.address);

            await expect(
                publicProcurement.connect(auditor).approveMilestone(tenderId, 1, { value: milestonePayment })
            )
                .to.emit(publicProcurement, "MilestoneCompleted")
                .withArgs(tenderId, 1, milestonePayment, bidder1.address);

            const finalBalance = await ethers.provider.getBalance(bidder1.address);
            expect(finalBalance - initialBalance).to.equal(milestonePayment);

            const tender = await publicProcurement.getTender(tenderId);
            expect(tender.currentMilestone).to.equal(1);
            expect(tender.state).to.equal(4); // InProgress
        });

        it("Should complete tender after all milestones", async function () {
            const milestonePayment = winningBid / 2n;

            await publicProcurement.connect(auditor).approveMilestone(tenderId, 1, { value: milestonePayment });

            await expect(
                publicProcurement.connect(auditor).approveMilestone(tenderId, 2, { value: milestonePayment })
            )
                .to.emit(publicProcurement, "TenderCompleted")
                .withArgs(tenderId);

            const tender = await publicProcurement.getTender(tenderId);
            expect(tender.state).to.equal(5); // Completed
            expect(tender.currentMilestone).to.equal(2);
        });

        it("Should only allow auditor to approve milestones", async function () {
            const milestonePayment = winningBid / 2n;

            await expect(
                publicProcurement.connect(bidder1).approveMilestone(tenderId, 1, { value: milestonePayment })
            ).to.be.revertedWith("Only auditor can call this");
        });

        it("Should enforce milestone order", async function () {
            const milestonePayment = winningBid / 2n;

            await expect(
                publicProcurement.connect(auditor).approveMilestone(tenderId, 2, { value: milestonePayment })
            ).to.be.revertedWith("Milestones must be completed in order");
        });
    });

    describe("Gas Analysis", function () {
        it("Should track gas for tender creation", async function () {
            const tx = await publicProcurement.createTender(DESCRIPTION_HASH, MAX_BUDGET, auditor.address);
            const receipt = await tx.wait();
            console.log("      Gas used for tender creation:", receipt.gasUsed.toString());
        });

        it("Should track gas for bid submission", async function () {
            await publicProcurement.createTender(DESCRIPTION_HASH, MAX_BUDGET, auditor.address);

            const amount = ethers.parseEther("8");
            const nonce = ethers.randomBytes(32);
            const hash = ethers.keccak256(
                ethers.solidityPacked(["uint256", "bytes32", "address"], [amount, nonce, bidder1.address])
            );

            const tx = await publicProcurement.connect(bidder1).submitBid(1, hash);
            const receipt = await tx.wait();
            console.log("      Gas used for bid submission:", receipt.gasUsed.toString());
        });
    });
});
