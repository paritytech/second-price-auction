var MultiCertifier = artifacts.require("MultiCertifier");
var Token = artifacts.require("FrozenToken");
var Auction = artifacts.require("SecondPriceAuction");

contract('auction', function(accounts) {
	it("locked tokens are released correctly", function() {
		const ADMIN = accounts[0];
		const TREASURY = accounts[1];
		const OWNER = accounts[2];
		const increaseTime = addSeconds => {
			web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [addSeconds], id: 0});
			web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 1});
		}
		var certifier;
		var auction;
		return MultiCertifier.deployed().then(function(instance) {
			certifier = instance;
			return Auction.deployed();
		}).then(function(instance) {
			auction = instance;
			return auction.isActive.call();
		}).then(function(isActive) {
			assert.equal(isActive, false, "The sale has not started.");
			return auction.allFinalised.call();
		}).then(function(allFinalised) {
			assert.equal(allFinalised, false, "The sale is not finalised.");
			return auction.currentPrice.call();
		}).then(function(earlyPrice) {
			assert.equal(earlyPrice, 0, "Price is 0 before the sale.");
		});
	});
});
