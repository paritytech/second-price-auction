//! Copyright Parity Technologies, 2017.
//! Released under the Apache Licence 2.

pragma solidity ^0.4.15;

/// Stripped down ERC20 standard token interface.
contract Token {
	function transfer(address _to, uint256 _value) returns (bool success);
}


// From Owned.sol
contract Owned {
	modifier only_owner { if (msg.sender != owner) return; _; }

	event NewOwner(address indexed old, address indexed current);

	function setOwner(address _new) only_owner { NewOwner(owner, _new); owner = _new; }

	address public owner = msg.sender;
}

// From Certifier.sol
contract Certifier {
	event Confirmed(address indexed who);
	event Revoked(address indexed who);
	function certified(address) constant returns (bool);
	function get(address, string) constant returns (bytes32) {}
	function getAddress(address, string) constant returns (address) {}
	function getUint(address, string) constant returns (uint) {}
}

contract CCCertifier is Certifier {
	function getCountryCode(address _who) constant returns (bytes2);
}

/**
 * Contract to allow multiple parties to collaborate over a certification contract.
 * Each certified account is associated with the delegate who certified it.
 * Delegates can be added and removed only by the contract owner.
 */
contract MultiCertifier is Owned, CCCertifier {
	modifier only_delegate { require (msg.sender == owner || delegates[msg.sender]); _; }
	modifier only_certifier_of(address who) { require (msg.sender == owner || msg.sender == certs[who].certifier); _; }
	modifier only_certified(address who) { require (certs[who].active); _; }
	modifier only_uncertified(address who) { require (!certs[who].active); _; }

	event Confirmed(address indexed who, address indexed by, bytes2 indexed countryCode);
	event Revoked(address indexed who, address indexed by);

	struct Certification {
		address certifier;
		bytes2 countryCode;
		bool active;
	}

	function certify(address _who, bytes2 _countryCode)
		only_delegate
		only_uncertified(_who)
	{
		certs[_who].active = true;
		certs[_who].certifier = msg.sender;
		certs[_who].countryCode = _countryCode;
		Confirmed(_who, msg.sender, _countryCode);
	}

	function revoke(address _who)
		only_certifier_of(_who)
		only_certified(_who)
	{
		certs[_who].active = false;
		Revoked(_who, msg.sender);
	}

	function certified(address _who) constant returns (bool) { return certs[_who].active; }
	function getCertifier(address _who) constant returns (address) { return certs[_who].certifier; }
	function getCountryCode(address _who) constant returns (bytes2) { return certs[_who].countryCode; }
	function addDelegate(address _new) only_owner { delegates[_new] = true; }
	function removeDelegate(address _old) only_owner { delete delegates[_old]; }

	mapping (address => Certification) certs;
	mapping (address => bool) delegates;
}

/// Simple Dutch Auction contract. Price starts high and monotonically decreases
/// until all tokens are sold at the current price with currently received
/// funds.
contract SecondPriceAuction {
	// Events:

	/// Someone bought in at a particular max-price.
	event Buyin(address indexed who, uint accounted, uint received, uint price);

	/// Someone deposited in at a particular max-price.
	event Deposited(address indexed who, uint accounted, uint received, uint price);

	/// Someone moved their Ether out of the contract.
	event DepositReturned(address indexed who, uint amount);

	/// Someone moved their Ether out of the contract.
	event DepositUsed(address indexed who, uint accounted, uint received);

	/// Admin injected a purchase.
	event Injected(address indexed who, uint accounted, uint received);

	/// Admin injected a purchase.
	event PrepayBuyin(address indexed who, uint accounted, uint received, uint price);

	/// At least 20 blocks have passed.
	event Ticked(uint era, uint received, uint accounted);

	/// The sale just ended with the current price.
	event Ended(uint price);

	/// Finalised the purchase for `who`, who has been given `tokens` tokens.
	event Finalised(address indexed who, uint tokens);

	/// Auction is over. All accounts finalised.
	event Retired();

	// Constructor:

	/// Simple constructor.
	/// Token cap should take be in whole tokens, not smallest divisible units.
	function SecondPriceAuction(address _tokenContract, address _treasury, address _admin, uint _beginTime, uint _tokenCap) {
		tokenContract = Token(_tokenContract);
		treasury = _treasury;
		admin = _admin;
		beginTime = _beginTime;
		tokenCap = _tokenCap;
		endTime = beginTime + 1000000;
	}

	// Public interaction:

	/// Buyin function. Throws if the sale is not active. May refund some of the
	/// funds if they would end the sale.
	function buyin(uint8 v, bytes32 r, bytes32 s)
		payable
		when_not_halted
		when_active
		avoid_dust
		only_signed(msg.sender, v, r, s)
		only_basic(msg.sender)
		only_certified_non_us(msg.sender)
	{
		flushEra();

		uint accounted;
		bool refund;
		uint price;
		(accounted, refund, price) = theDeal(msg.value, false);

		/// No refunds allowed.
		require (!refund);

		// record the acceptance.
		buyins[msg.sender].accounted += uint128(accounted);
		buyins[msg.sender].received += uint128(msg.value);
		totalAccounted += accounted;
		totalReceived += msg.value;
		endTime = calculateEndTime();
		Buyin(msg.sender, accounted, msg.value, price);

		// send to treasury
		require (treasury.send(msg.value));
	}

	function deposit(uint8 v, bytes32 r, bytes32 s)
		payable
		when_not_halted
		when_active
		avoid_dust
		only_signed(msg.sender, v, r, s)
		only_basic(msg.sender)
		only_certified(msg.sender)
	{
		flushEra();

		uint accounted;
		bool refund;
		uint price;
		(accounted, refund, price) = theDeal(msg.value, true);

		/// No refunds allowed.
		require (!refund);

		// record the acceptance.
		deposits[msg.sender].accounted += uint128(accounted);
		deposits[msg.sender].received += uint128(msg.value);
		totalAccounted += accounted;
		totalReceived += msg.value;
		endTime = calculateEndTime();
		Deposited(msg.sender, accounted, msg.value, price);
	}

	/// Return any funds previously deposited.
	function returnDeposit()
		when_ended
	{
		var accounted = deposits[msg.sender].accounted;
		var received = deposits[msg.sender].received;
		delete deposits[msg.sender];

		totalAccounted -= accounted;
		totalReceived -= received;

		require (msg.sender.send(received));

		DepositReturned(msg.sender, received);
	}

	/// Transfer deposit into tokens.
	function executeDeposit(address _who)
		when_launch_imminent
	{
		var accounted = deposits[_who].accounted;
		var received = deposits[_who].received;
		delete deposits[_who];

		buyins[_who].accounted += accounted;
		buyins[_who].received += received;

		require (treasury.send(received));

		DepositUsed(_who, accounted, received);
	}

	/// Like buyin except no payment required.
	function prepayBuyin(uint8 v, bytes32 r, bytes32 s, address _who, uint128 _value)
	    when_not_halted
	    when_active
	    only_admin
	    only_signed(_who, v, r, s)
	    only_basic(_who)
	    only_certified(_who)
	{
		flushEra();

		uint accounted;
		bool refund;
		uint price;
		(accounted, refund, price) = theDeal(_value, false);

		/// No refunds allowed.
		require (!refund);

		buyins[_who].accounted += uint128(accounted);
		buyins[_who].received += uint128(_value);
		totalAccounted += accounted;
		totalReceived += _value;
		endTime = calculateEndTime();
		PrepayBuyin(_who, accounted, _value, price);
	}

	/// Like buyin except no payment required and bonus automatically given.
	function inject(address _who, uint128 _received)
	    only_admin
	    only_basic(_who)
	{
		uint128 bonus = _received * uint128(BONUS_SIZE) / 100;
		uint128 accounted = _received + bonus;

		buyins[_who].accounted += accounted;
		buyins[_who].received += _received;
		totalAccounted += accounted;
		totalReceived += _received;
		endTime = calculateEndTime();
		Injected(_who, accounted, _received);
	}

	/// Mint tokens for a particular participant.
	function finalise(address _who)
		when_not_halted
		when_ended
		only_buyins(_who)
	{
		// end the auction if we're the first one to finalise.
		if (endPrice == 0) {
			endPrice = totalAccounted / tokenCap;
			Ended(endPrice);
		}

		// enact the purchase.
		uint total = buyins[_who].accounted;
		uint tokens = total / endPrice;
		totalFinalised += total;
		delete buyins[_who];
		require (tokenContract.transfer(_who, tokens));

		Finalised(_who, tokens);

		if (totalFinalised == totalAccounted) {
			Retired();
		}
	}

	function flushEra() private {
		uint currentEra = (now - beginTime) / ERA_PERIOD;
		if (currentEra > eraIndex) {
			Ticked(eraIndex, totalReceived, totalAccounted);
		}
		eraIndex = currentEra;
	}

	// Admin interaction:

	/// Emergency function to pause buy-in and finalisation.
	function setHalted(bool _halted) only_admin { halted = _halted; }

	/// Emergency function to drain the contract of any funds.
	function drain() only_admin { require (treasury.send(this.balance)); }

	/// Set whether the launch is imminent or not.
	function setLaunchImminent(bool _imminent) only_admin { launchImminent = _imminent; }


	// Inspection:

	/// The current end time of the sale assuming that nobody else buys in.
	function calculateEndTime() constant returns (uint) {
		var factor = tokenCap / DIVISOR * USDWEI;
		return beginTime + 18432000 * factor / (totalAccounted + 5 * factor) - 5760;
	}

	/// The current price for a single indivisible part of a token. If a buyin happens now, this is
	/// the highest price per indivisible token part that the buyer will pay. This doesn't
	/// include the discount which may be available.
	function currentPrice() constant returns (uint weiPerIndivisibleTokenPart) {
		if (!isActive()) return 0;
		return (USDWEI * 18432000 / (now - beginTime + 5760) - USDWEI * 5) / DIVISOR;
	}

	/// Returns the total indivisible token parts available for purchase right now.
	function tokensAvailable() constant returns (uint tokens) {
		if (!isActive()) return 0;
		return tokenCap - totalAccounted / currentPrice();
	}

	/// The largest purchase than can be made at present, not including any
	/// discount.
	function maxPurchase() constant returns (uint spend) {
		if (!isActive()) return 0;
		return tokenCap * currentPrice() - totalAccounted;
	}

	/// Get the number of `tokens` that would be given if the sender were to
	/// spend `_value` now. Also tell you what `refund` would be given, if any.
	function theDeal(uint _value, bool _isDeposit)
		constant
		returns (uint accounted, bool refund, uint price)
	{
		if (!isActive()) return;

		uint bonus = this.bonus(_value);
		uint hit = _isDeposit ? _value * (100 - DEPOSIT_HIT) / 100 : 0;

		price = currentPrice();
		accounted = _value + bonus - hit;

		uint available = tokensAvailable();
		uint tokens = accounted / price;
		refund = (tokens > available);
	}

	/// Any applicable bonus to `_value`.
	function bonus(uint _value)
		constant
		returns (uint extra)
	{
		if (!isActive()) return 0;
		if (now < beginTime + BONUS_DURATION) {
			return _value * BONUS_SIZE / 100;
		}
		return 0;
	}

	/// True if the sale is ongoing.
	function isActive() constant returns (bool) { return now >= beginTime && now < endTime; }

	/// True if all buyins have finalised.
	function allFinalised() constant returns (bool) { return now >= endTime && totalAccounted == totalFinalised; }

	/// Returns true if the sender of this transaction is a basic account.
	function isBasicAccount(address _who) internal returns (bool) {
		uint senderCodeSize;
		assembly {
			senderCodeSize := extcodesize(_who)
		}
	    return senderCodeSize == 0;
	}

	// Modifiers:

	/// Ensure the sale is ongoing.
	modifier when_active { require (isActive()); _; }

	/// Ensure the sale is ended.
	modifier when_ended { require (now >= endTime); _; }

	/// Ensure we're not halted.
	modifier when_not_halted { require (!halted); _; }

	/// Ensure all buyins have finalised.
	modifier when_all_finalised { require (allFinalised()); _; }

	/// Ensure all buyins have finalised.
	modifier when_launch_imminent { require (launchImminent); _; }

	/// Ensure the sender sent a sensible amount of ether.
	modifier avoid_dust { require (msg.value >= DUST_LIMIT); _; }

	/// Ensure `_who` is a participant.
	modifier only_buyins(address _who) { require (buyins[_who].accounted != 0); _; }

	/// Ensure sender is admin.
	modifier only_admin { require (msg.sender == admin); _; }

	/// Ensure that the signature is valid.
	modifier only_signed(address who, uint8 v, bytes32 r, bytes32 s) { require (ecrecover(STATEMENT_HASH, v, r, s) == who); _; }

	/// Ensure sender is not a contract.
	modifier only_basic(address who) { require (isBasicAccount(who)); _; }

    /// Ensure sender is a KYCed non-US citizen.
	modifier only_certified_non_us(address who) {
		require (certifier.certified(who));
		var cc = certifier.getCountryCode(who);
		require (cc != bytes2("us") && cc != bytes2("gb") && cc != bytes2("jp"));
		_;
	}

    /// Ensure sender is KYCed.
	modifier only_certified(address who) {
		require (certifier.certified(who));
		var cc = certifier.getCountryCode(who);
		require (cc != bytes2("jp"));
		_;
	}

	// State:

	struct Account {
		uint128 accounted;	// including bonus & hit
		uint128 received;	// just the amount received, without bonus & hit
	}

	/// Those who have bought in to the auction.
	mapping (address => Account) public buyins;

	/// Those who have placed ether on deposit for the auction.
	mapping (address => Account) public deposits;

	/// Total amount of ether received, excluding phantom "bonus" ether.
	uint public totalReceived = 0;

	/// Total amount of ether received, including phantom "bonus" ether.
	uint public totalAccounted = 0;

	/// Total amount of ether which has been finalised.
	uint public totalFinalised = 0;

	/// The current end time. Gets updated when new funds are received.
	uint public endTime;

	/// The price per token; only valid once the sale has ended and at least one
	/// participant has finalised.
	uint public endPrice;

	/// Must be false for any public function to be called.
	bool public halted;

	/// True if the launch is imminent and deposits can be transferred into tokens.
	bool public launchImminent;

	// Constants after constructor:

	/// The tokens contract.
	Token public tokenContract;

	/// The certifier.
	CCCertifier public certifier = CCCertifier(0xaEBd300d5Bc5f357cF35715C0169985484A70184);

	/// The treasury address; where all the Ether goes.
	address public treasury;

	/// The admin address; auction can be paused or halted at any time by this.
	address public admin;

	/// The time at which the sale begins.
	uint public beginTime;

	/// Maximum amount of tokens to mint. Once totalAccounted / currentPrice is
	/// greater than this, the sale ends.
	uint public tokenCap;

	// Era stuff (isolated)
	/// The era for which the current consolidated data represents.
	uint public eraIndex;

	/// The size of the era in seconds.
	uint constant public ERA_PERIOD = 5 minutes;

	// Static constants:

	/// Anything less than this is considered dust and cannot be used to buy in.
	uint constant public DUST_LIMIT = 5 finney;

	/// The hash of the statement which must be signed in order to buyin.
	bytes32 constant public STATEMENT_HASH = sha3(STATEMENT);

	/// The statement which should be signed.
	string constant public STATEMENT = "\x19Ethereum Signed Message:\n47Please take my Ether and try to build Polkadot.";

	//# Statement to actually sign.
	//# ```js
	//# statement = function() { this.STATEMENT().map(s => s.substr(28)) }
	//# ```

	/// Percentage of the purchase that is free during bonus period.
	uint constant public BONUS_SIZE = 15;

	/// Duration after sale begins that bonus is active.
	uint constant public BONUS_DURATION = 1 hours;

	/// Percentage of the spend that is deducted from a deposit.
	uint constant public DEPOSIT_HIT = 45;

	/// Number of Wei in one USD, constant.
	uint constant public USDWEI = 1 ether / 200;

	/// Divisor of the token.
	uint constant public DIVISOR = 1000;
}
