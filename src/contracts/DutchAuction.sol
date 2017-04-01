//! Copyright Parity Technologies, 2017.
//! Released under the Apache Licence 2.

pragma solidity ^0.4.7;

/// Stripped down ERC20 standard token interface.
contract Token {
	function transfer(address _to, uint256 _value) returns (bool success);
}

/// Stripped Badge token interface.
contract Certifier {
	function certified(address _who) constant returns (bool);
}

/// Simple Dutch Auction contract. Price starts high and monotonically decreases
/// until all tokens are sold at the current price with currently received
/// funds.
contract DutchAuction {
	/// Someone bought in at a particular max-price.
	event Buyin(address indexed who, uint accepted, uint refund, uint price, uint bonus);

	/// The sale just ended with the current price.
	event Ended(uint price);

	/// Finalised the purchase for `who`, who has been given `tokens` tokens.
	event Finalised(address indexed who, uint tokens);

	/// Auction is over. All accounts finalised.
	event Retired();

	/// Simple constructor.
	function DutchAuction(address _tokenContract, address _treasury, address _admin, uint _beginTime, uint _beginPrice, uint _saleSpeed, uint _tokenCap) {
		tokenContract = Token(_tokenContract);
		treasury = _treasury;
		admin = _admin;
		beginTime = _beginTime;
		beginPrice = _beginPrice;
		saleSpeed = _saleSpeed;
		tokenCap = _tokenCap;
		endTime = beginTime + beginPrice / saleSpeed;
	}

	/// Buyin function. Throws if the sale is not active. May refund some of the
	/// funds if they would end the sale.
	function buyin(uint8 v, bytes32 r, bytes32 s)
		payable
		when_not_halted
		when_active
		avoid_dust
		only_signed(msg.sender, v, r, s)
	{
		uint accepted;
		uint refund;
		uint price;
		uint bonus;
		(accepted, refund, price, bonus) = theDeal(msg.value, msg.sender);

		// record the acceptance.
		participants[msg.sender] += accepted;
		totalReceived += accepted;
		uint targetPrice = totalReceived / tokenCap;
		uint salePriceDrop = beginPrice - targetPrice;
		uint saleDuration = salePriceDrop / saleSpeed;
		endTime = beginTime + saleDuration;
		Buyin(msg.sender, accepted, refund, price, bonus);

		// send to treasury
		if (!treasury.send(accepted)) throw;
		// issue refund
		if (!msg.sender.send(refund)) throw;
	}

	/// Mint tokens for a particular participant.
	function finalise(address _who)
		when_not_halted
		when_ended
		only_participants(_who)
	{
		// end the auction if we're the first one to finalise.
		if (endPrice == 0) {
			endPrice = totalReceived / tokenCap;
			Ended(endPrice);
		}

		// enact the purchase.
		uint tokens = participants[_who] / endPrice;
		totalFinalised += participants[_who];
		participants[_who] = 0;
		if (!tokenContract.transfer(_who, tokens)) throw;

		Finalised(_who, tokens);

		if (totalFinalised == totalReceived) {
			Retired();
		}
	}

	/// Emergency function to pause buy-in and finalisation.
	function setHalted(bool _halted) only_admin { halted = _halted; }

	/// Emergency function to drain the contract of any funds.
	function drain() only_admin { if (!treasury.send(this.balance)) throw; }

	/// Kill this contract once the sale is finished.
	function kill() when_all_finalised { suicide(admin); }

	/// The current price for a single token. If a buyin happens now, this is
	/// the highest price per token that the buyer will pay. This doesn't
	/// include the discount which may be available.
	function currentPrice() constant returns (uint weiPerToken) {
		if (!isActive()) return 0;
		return beginPrice - (now - beginTime) * saleSpeed;
	}

	/// Returns the tokens available for purchase right now.
	function tokensAvailable() constant returns (uint tokens) {
		if (!isActive()) return 0;
		return tokenCap - totalReceived / currentPrice();
	}

	/// The largest purchase than can be made at present, not including any
	/// discount.
	function maxPurchase() constant returns (uint spend) {
		if (!isActive()) return 0;
		return tokenCap * currentPrice() - totalReceived;
	}

	/// Get the number of `tokens` that would be given if the sender were to
	/// spend `_value` now. Also tell you what `refund` would be given, if any.
	function theDeal(uint _value, address _who)
		constant
		returns (uint tokens, uint refund, uint price, uint bonus)
	{
		if (!isActive()) return;
		bonus = this.bonus(_value, _who);
		_value += bonus;
		price = currentPrice();
		uint accepted = _value;
		uint available = tokensAvailable();
		tokens = _value / price;
		refund = 0;

		// if we've asked for too many, we should send back the extra.
		if (tokens > available) {
			refund = _value - available * price;
			accepted -= refund;
		}
	}

	/// Add any applicable bonus to `_value` for `_who` and returns it.
	function bonus(uint _value, address _who)
		constant
		returns (uint extra)
	{
		if (!isActive()) return 0;
		if (now < beginTime + BONUS_DURATION && uniquePerson.certified(_who)) {
			uint already = participants[_who] * 100 / (100 + BONUS_SIZE);
			uint yet = already < BONUS_LIMIT ? BONUS_LIMIT - already : 0;
			return _value > yet
				? yet * BONUS_SIZE / 100
				: _value * BONUS_SIZE / 100;
		}
		return _value;
	}

	/// True if the sale is ongoing.
	function isActive() constant returns (bool) { return now >= beginTime && now < endTime; }

	/// True if all participants have finalised.
	function allFinalised() constant returns (bool) { return now >= endTime && totalReceived == totalFinalised; }

	/// Ensure the sale is ongoing.
	modifier when_active { if (isActive()) _; else throw; }

	/// Ensure the sale is ended.
	modifier when_ended { if (now >= endTime) _; else throw; }

	/// Ensure we're not halted.
	modifier when_not_halted { if (!halted) _; else throw; }

	/// Ensure all participants have finalised.
	modifier when_all_finalised { if (allFinalised()) _; else throw; }

	/// Ensure the sender sent a sensible amount of ether.
	modifier avoid_dust { if (msg.value >= DUST_LIMIT) _; else throw; }

	/// Ensure `_who` is a participant.
	modifier only_participants(address _who) { if (participants[_who] != 0) _; else throw; }

	/// Ensure sender is admin.
	modifier only_admin { if (msg.sender == admin) _; else throw; }

	/// Ensure that the signature is valid.
	modifier only_signed(address who, uint8 v, bytes32 r, bytes32 s) { if (ecrecover(STATEMENT_HASH, v, r, s) == who) _; else throw; }

	// State:

	/// The auction participants.
	mapping (address => uint) public participants;

	/// Total amount of ether received.
	uint public totalReceived = 0;

	/// Total amount of ether which has been finalised.
	uint public totalFinalised = 0;

	/// The current end time. Gets updated when new funds are received.
	uint public endTime;

	/// The price per token; only valid once the sale has ended and at least one
	/// participant has finalised.
	uint public endPrice;

	/// Must be false for any public function to be called.
	bool public halted;

	// Constants after constructor:

	/// The tokens contract.
	Token public tokenContract;

	/// The unique person certifier.
	Certifier public uniquePerson = Certifier(0xeAcDEd0D0D6a6145d03Cd96A19A165D56FA122DF);

	/// The treasury address; where all the Ether goes.
	address public treasury;

	/// The admin address; auction can be paused or halted at any time by this.
	address public admin;

	/// The time at which the sale begins.
	uint public beginTime;

	/// Price at which the sale begins.
	uint public beginPrice;

	/// The speed at which the price reduces, in Wei per second.
	uint public saleSpeed;

	/// Maximum amount of tokens to mint. Once totalSale / currentPrice is
	/// greater than this, the sale ends.
	uint public tokenCap;

	// Static constants:

	/// Anything less than this is considered dust and cannot be used to buy in.
	uint constant public DUST_LIMIT = 10 finney;

	/// The hash of the statement which must be signed in order to buyin.
	bytes32 constant public STATEMENT_HASH = sha3(STATEMENT);

	/// The statement which should be signed.
	string constant public STATEMENT = "\x19Ethereum Signed Message:\n47Please take my Ether and try to build Polkadot.";

	/// Statement to actually sign.
	/// ```js
	/// function statement() { STATEMENT().map(s => s.substr(28)) }
	/// ```

	/// Percentage extra given for discounted purchases.
	uint constant public BONUS_SIZE = 10;

	/// Maxiumum amount of Ether per unique person prior during power hour.
	uint constant public BONUS_LIMIT = 100 ether;

	/// Duration after sale begins that discount is given.
	uint constant public BONUS_DURATION = 1 hours;
}
