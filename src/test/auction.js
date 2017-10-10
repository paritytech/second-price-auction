var Auction = artifacts.require("SecondPriceAuction");

const increaseTime = addSeconds => {
	web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [addSeconds], id: 0});
	web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 1});
}

contract('auction', function(accounts) {
	it("Constant time flow.", function() {
		var auction;
		var tokenCap;
		var endTime;
		return Auction.deployed().then(function(instance) {
			auction = instance;
			return auction.tokenCap.call();
		}).then(function(cap) {
			tokenCap = cap.toNumber();
			assert.isAbove(tokenCap, 0, "Selling some tokens.");
			return auction.isActive.call();
		}).then(function(isActive) {
			assert.equal(isActive, false, "The sale has not started.");
			return auction.allFinalised.call();
		}).then(function(allFinalised) {
			assert.equal(allFinalised, false, "The sale is not finalised.");
			return auction.currentPrice.call();
		}).then(assert.fail).catch(function(error) {
			assert.include(error.message, 'invalid opcode', "No price before the sale.");
			return auction.calculateEndTime.call();
		}).then(function(end) {
			endTime = end.toNumber();
			assert.isAbove(endTime, web3.eth.getBlock(web3.eth.blockNumber).timestamp, "Sale ends later.");
			increaseTime(1000);
			return auction.isActive.call();
		}).then(function(isActive) {
			assert.equal(isActive, true, "The sale has started.");
			return auction.allFinalised.call();
		}).then(function(allFinalised) {
			assert.equal(allFinalised, false, "The sale is not finalised.");
			return auction.currentPrice.call();
		}).then(function(currentPrice) {
			assert.isAbove(currentPrice, 0, "Price is greater than 0 during the sale.");
			return auction.calculateEndTime.call();
		}).then(function(end) {
			assert.equal(end.toNumber(), endTime, "No contributions means that the end estimate is the same.");
			return auction.tokensAvailable.call();
		}).then(function(available) {
			assert.equal(available.toNumber(), tokenCap, "All tokens available.");
			return auction.maxPurchase.call();
		}).then(function(purchase) {
			assert.isAbove(purchase.toNumber(), 0, "Can purchase tokens.");
			return auction.bonus.call(100);
		}).then(function(extra) {
			assert.equal(extra.toNumber(), 15, "Gets bonus at the start.");
			return auction.theDeal.call(100);
		}).then(function(deal) {
			assert.equal(deal[0].toNumber(), 115, "Accounted with bonus.");
			assert.equal(deal[1], false, "No refund needed.");
			assert.isAbove(deal[2].toNumber(), 0, "Positive price.");
			return auction.BONUS_MAX_DURATION.call();
		}).then(function(duration) {
			increaseTime(duration.toNumber());
			return auction.bonus.call(100);
		}).then(function(extra) {
			assert.equal(extra.toNumber(), 15, "Bonus later if no empty blocks.");
			increaseTime(endTime);
			return auction.isActive.call();
		}).then(function(isActive) {
			assert.equal(isActive, false, "The sale has ended.");
			return auction.allFinalised.call();
		}).then(function(allFinalised) {
			assert.equal(allFinalised, true, "No tokens sold, all finalised.");
			return auction.currentPrice.call();
		}).then(assert.fail).catch(function(error) {
			assert.include(error.message, 'invalid opcode', "No price after the sale.");
		});
	});
});
