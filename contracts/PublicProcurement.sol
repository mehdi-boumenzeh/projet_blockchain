// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PublicProcurement
 * @notice Vulnerable version - Contains intentional security flaws for educational purposes
 * @dev Manages public procurement tenders with commit-reveal bidding and milestone payments
 * 
 * INTENTIONAL VULNERABILITIES:
 * 1. Reentrancy in approveMilestone() - transfers before state updates
 * 2. Timestamp manipulation possible in deadline checks
 * 3. No return value check on ETH transfers
 */
contract PublicProcurement {
    
    // ============ Enums ============
    
    enum TenderState {
        Created,
        Bidding,
        Revealing,
        WinnerSelected,
        InProgress,
        Completed,
        Cancelled
    }
    
    // ============ Structs ============
    
    struct Tender {
        uint256 id;
        bytes32 descriptionHash;
        uint256 maxBudget;
        uint256 submissionDeadline;
        uint256 revealDeadline;
        address owner;
        TenderState state;
        address winner;
        uint256 winningBid;
        uint256 currentMilestone;
        uint256 totalMilestones;
        address auditor;
    }
    
    struct Bid {
        address bidder;
        bytes32 commitHash;
        uint256 revealedAmount;
        bool revealed;
        bool valid;
    }
    
    // ============ State Variables ============
    
    address public contractOwner;
    uint256 public tenderCounter;
    
    // Mappings
    mapping(uint256 => Tender) public tenders;
    mapping(uint256 => mapping(address => Bid)) public bids;
    mapping(uint256 => address[]) public bidders;
    mapping(uint256 => mapping(uint256 => bool)) public milestonesCompleted;
    
    // ============ Events ============
    
    event TenderCreated(
        uint256 indexed tenderId,
        bytes32 descriptionHash,
        uint256 maxBudget,
        uint256 submissionDeadline,
        uint256 revealDeadline
    );
    
    event BidSubmitted(
        uint256 indexed tenderId,
        address indexed bidder,
        bytes32 commitHash
    );
    
    event BidRevealed(
        uint256 indexed tenderId,
        address indexed bidder,
        uint256 amount,
        bool valid
    );
    
    event WinnerSelected(
        uint256 indexed tenderId,
        address indexed winner,
        uint256 amount
    );
    
    event MilestoneCompleted(
        uint256 indexed tenderId,
        uint256 milestone,
        uint256 amount,
        address recipient
    );
    
    event TenderCompleted(uint256 indexed tenderId);
    
    event TenderCancelled(uint256 indexed tenderId, string reason);
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == contractOwner, "Only contract owner can call this");
        _;
    }
    
    modifier onlyTenderOwner(uint256 _tenderId) {
        require(msg.sender == tenders[_tenderId].owner, "Only tender owner can call this");
        _;
    }
    
    modifier onlyAuditor(uint256 _tenderId) {
        require(msg.sender == tenders[_tenderId].auditor, "Only auditor can call this");
        _;
    }
    
    modifier inState(uint256 _tenderId, TenderState _state) {
        require(tenders[_tenderId].state == _state, "Invalid tender state");
        _;
    }
    
    modifier beforeDeadline(uint256 _deadline) {
        // VULNERABILITY: Timestamp manipulation possible
        require(block.timestamp < _deadline, "Deadline has passed");
        _;
    }
    
    modifier afterDeadline(uint256 _deadline) {
        // VULNERABILITY: Timestamp manipulation possible
        require(block.timestamp >= _deadline, "Deadline not reached yet");
        _;
    }
    
    modifier tenderExists(uint256 _tenderId) {
        require(_tenderId > 0 && _tenderId <= tenderCounter, "Tender does not exist");
        _;
    }
    
    // ============ Constructor ============
    
    constructor() {
        contractOwner = msg.sender;
        tenderCounter = 0;
    }
    
    // ============ Phase 1: Tender Creation ============
    
    /**
     * @notice Create a new tender
     * @param _descriptionHash Hash of the tender description
     * @param _maxBudget Maximum budget in wei
     * @param _auditor Address of the auditor who will approve milestones
     */
    function createTender(
        bytes32 _descriptionHash,
        uint256 _maxBudget,
        address _auditor
    ) external onlyOwner returns (uint256) {
        require(_maxBudget > 0, "Budget must be greater than 0");
        require(_auditor != address(0), "Invalid auditor address");
        
        tenderCounter++;
        uint256 tenderId = tenderCounter;
        
        // Fixed parameters as per requirements
        uint256 submissionDeadline = block.timestamp + 2 days;
        uint256 revealDeadline = submissionDeadline + 1 days;
        uint256 totalMilestones = 2;
        
        tenders[tenderId] = Tender({
            id: tenderId,
            descriptionHash: _descriptionHash,
            maxBudget: _maxBudget,
            submissionDeadline: submissionDeadline,
            revealDeadline: revealDeadline,
            owner: msg.sender,
            state: TenderState.Bidding,
            winner: address(0),
            winningBid: 0,
            currentMilestone: 0,
            totalMilestones: totalMilestones,
            auditor: _auditor
        });
        
        emit TenderCreated(
            tenderId,
            _descriptionHash,
            _maxBudget,
            submissionDeadline,
            revealDeadline
        );
        
        return tenderId;
    }
    
    // ============ Phase 2: Commit Phase ============
    
    /**
     * @notice Submit a bid commitment (hash)
     * @param _tenderId ID of the tender
     * @param _commitHash Hash of keccak256(abi.encodePacked(amount, nonce, bidder))
     */
    function submitBid(uint256 _tenderId, bytes32 _commitHash)
        external
        tenderExists(_tenderId)
        inState(_tenderId, TenderState.Bidding)
        beforeDeadline(tenders[_tenderId].submissionDeadline)
    {
        require(_commitHash != bytes32(0), "Invalid commit hash");
        require(bids[_tenderId][msg.sender].commitHash == bytes32(0), "Bid already submitted");
        
        bids[_tenderId][msg.sender] = Bid({
            bidder: msg.sender,
            commitHash: _commitHash,
            revealedAmount: 0,
            revealed: false,
            valid: false
        });
        
        bidders[_tenderId].push(msg.sender);
        
        emit BidSubmitted(_tenderId, msg.sender, _commitHash);
    }
    
    // ============ Phase 3: Reveal Phase ============
    
    /**
     * @notice Reveal a previously submitted bid
     * @param _tenderId ID of the tender
     * @param _amount Bid amount in wei
     * @param _nonce Random nonce used in commitment
     */
    function revealBid(uint256 _tenderId, uint256 _amount, bytes32 _nonce)
        external
        tenderExists(_tenderId)
    {
        Tender storage tender = tenders[_tenderId];
        
        // Automatically transition to Revealing state if submission deadline passed
        if (tender.state == TenderState.Bidding && block.timestamp >= tender.submissionDeadline) {
            tender.state = TenderState.Revealing;
        }
        
        require(tender.state == TenderState.Revealing, "Not in revealing phase");
        require(block.timestamp < tender.revealDeadline, "Reveal deadline has passed");
        
        Bid storage bid = bids[_tenderId][msg.sender];
        require(bid.commitHash != bytes32(0), "No bid submitted");
        require(!bid.revealed, "Bid already revealed");
        
        // Verify the commitment
        bytes32 computedHash = keccak256(abi.encodePacked(_amount, _nonce, msg.sender));
        require(computedHash == bid.commitHash, "Invalid reveal: hash mismatch");
        
        // Check if bid is valid (within budget)
        bool isValid = _amount <= tender.maxBudget && _amount > 0;
        
        bid.revealedAmount = _amount;
        bid.revealed = true;
        bid.valid = isValid;
        
        emit BidRevealed(_tenderId, msg.sender, _amount, isValid);
    }
    
    // ============ Phase 4: Winner Selection ============
    
    /**
     * @notice Select the winner (lowest valid bid)
     * @param _tenderId ID of the tender
     */
    function selectWinner(uint256 _tenderId)
        external
        tenderExists(_tenderId)
        afterDeadline(tenders[_tenderId].revealDeadline)
    {
        Tender storage tender = tenders[_tenderId];
        
        // Automatically transition from Bidding if no one revealed
        if (tender.state == TenderState.Bidding) {
            tender.state = TenderState.Revealing;
        }
        
        require(
            tender.state == TenderState.Revealing,
            "Winner already selected or tender cancelled"
        );
        
        address[] memory tenderBidders = bidders[_tenderId];
        address lowestBidder = address(0);
        uint256 lowestAmount = type(uint256).max;
        
        // Find the lowest valid bid
        for (uint256 i = 0; i < tenderBidders.length; i++) {
            address bidder = tenderBidders[i];
            Bid storage bid = bids[_tenderId][bidder];
            
            if (bid.revealed && bid.valid && bid.revealedAmount < lowestAmount) {
                lowestAmount = bid.revealedAmount;
                lowestBidder = bidder;
            }
        }
        
        // Check if we found a valid winner
        if (lowestBidder == address(0)) {
            tender.state = TenderState.Cancelled;
            emit TenderCancelled(_tenderId, "No valid bids");
            return;
        }
        
        tender.winner = lowestBidder;
        tender.winningBid = lowestAmount;
        tender.state = TenderState.WinnerSelected;
        
        emit WinnerSelected(_tenderId, lowestBidder, lowestAmount);
    }
    
    // ============ Phase 5: Milestone Payments ============
    
    /**
     * @notice Approve a milestone and release payment
     * @param _tenderId ID of the tender
     * @param _milestoneNumber Milestone number (1-based)
     * 
     * VULNERABILITY: Reentrancy attack possible here!
     * - Transfers ETH before updating state
     * - No checks-effects-interactions pattern
     * - No reentrancy guard
     */
    function approveMilestone(uint256 _tenderId, uint256 _milestoneNumber)
        external
        payable
        tenderExists(_tenderId)
        onlyAuditor(_tenderId)
    {
        Tender storage tender = tenders[_tenderId];
        
        require(
            tender.state == TenderState.WinnerSelected || tender.state == TenderState.InProgress,
            "Invalid state for milestone approval"
        );
        require(_milestoneNumber > 0 && _milestoneNumber <= tender.totalMilestones, "Invalid milestone number");
        require(!milestonesCompleted[_tenderId][_milestoneNumber], "Milestone already completed");
        require(_milestoneNumber == tender.currentMilestone + 1, "Milestones must be completed in order");
        
        // Calculate payment amount (equal distribution)
        uint256 paymentAmount = tender.winningBid / tender.totalMilestones;
        
        // Ensure contract has enough balance
        require(msg.value >= paymentAmount, "Insufficient payment sent");
        
        // VULNERABILITY: Transfer before state update (reentrancy risk)
        // VULNERABILITY: No return value check on transfer
        payable(tender.winner).transfer(paymentAmount);
        
        // Update state AFTER transfer (wrong order!)
        milestonesCompleted[_tenderId][_milestoneNumber] = true;
        tender.currentMilestone = _milestoneNumber;
        
        // Transition to InProgress after first milestone
        if (tender.state == TenderState.WinnerSelected) {
            tender.state = TenderState.InProgress;
        }
        
        emit MilestoneCompleted(_tenderId, _milestoneNumber, paymentAmount, tender.winner);
        
        // Check if all milestones are completed
        if (tender.currentMilestone == tender.totalMilestones) {
            tender.state = TenderState.Completed;
            emit TenderCompleted(_tenderId);
        }
        
        // Refund excess payment
        if (msg.value > paymentAmount) {
            payable(msg.sender).transfer(msg.value - paymentAmount);
        }
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get tender details
     */
    function getTender(uint256 _tenderId)
        external
        view
        tenderExists(_tenderId)
        returns (Tender memory)
    {
        return tenders[_tenderId];
    }
    
    /**
     * @notice Get bid details
     */
    function getBid(uint256 _tenderId, address _bidder)
        external
        view
        tenderExists(_tenderId)
        returns (Bid memory)
    {
        return bids[_tenderId][_bidder];
    }
    
    /**
     * @notice Get all bidders for a tender
     */
    function getBidders(uint256 _tenderId)
        external
        view
        tenderExists(_tenderId)
        returns (address[] memory)
    {
        return bidders[_tenderId];
    }
    
    /**
     * @notice Check if milestone is completed
     */
    function isMilestoneCompleted(uint256 _tenderId, uint256 _milestoneNumber)
        external
        view
        tenderExists(_tenderId)
        returns (bool)
    {
        return milestonesCompleted[_tenderId][_milestoneNumber];
    }
    
    /**
     * @notice Get current state name as string (for debugging)
     */
    function getStateName(uint256 _tenderId)
        external
        view
        tenderExists(_tenderId)
        returns (string memory)
    {
        TenderState state = tenders[_tenderId].state;
        
        if (state == TenderState.Created) return "Created";
        if (state == TenderState.Bidding) return "Bidding";
        if (state == TenderState.Revealing) return "Revealing";
        if (state == TenderState.WinnerSelected) return "WinnerSelected";
        if (state == TenderState.InProgress) return "InProgress";
        if (state == TenderState.Completed) return "Completed";
        if (state == TenderState.Cancelled) return "Cancelled";
        
        return "Unknown";
    }
    
    // ============ Utility Functions ============
    
    /**
     * @notice Generate commit hash off-chain helper (view function for testing)
     */
    function generateCommitHash(uint256 _amount, bytes32 _nonce, address _bidder)
        external
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(_amount, _nonce, _bidder));
    }
    
    /**
     * @notice Allow contract to receive ETH
     */
    receive() external payable {}
    
    /**
     * @notice Fallback function
     */
    fallback() external payable {}
}
