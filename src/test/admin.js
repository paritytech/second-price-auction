var Auction = artifacts.require("SecondPriceAuction");

const increaseTime = addSeconds => {
	web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [addSeconds], id: 0});
	web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 1});
}

contract('admin', function(accounts) {
	it("Admin permissions.", function() {
		const ADMIN = accounts[1];
		const PARTICIPANT = accounts[5];
		var auction;
		return Auction.deployed().then(function(instance) {
			auction = instance;
			return auction.inject(PARTICIPANT, 100, { from: PARTICIPANT });
		}).then(assert.fail).catch(function(error) {
			assert.include(error.message, 'invalid opcode', 'Participant can not inject.');
			return auction.beginTime.call();
		}).then(function(begin) {
			assert.isAbove(begin.toNumber(), web3.eth.getBlock(web3.eth.blockNumber).timestamp);
			auction.inject(PARTICIPANT, 100, { from: ADMIN });
			return auction.totalReceived.call()
		}).then(function(received) {
			assert.equal(received.toNumber(), 100, "All received.");
			increaseTime(1000);
			return auction.inject(PARTICIPANT, 100, { from: ADMIN });
		}).then(assert.fail).catch(function(error) {
			assert.include(error.message, 'invalid opcode', 'Admin can not inject when begun.');
			return auction.setHalted(true, { from: PARTICIPANT });
		}).then(assert.fail).catch(function(error) {
			assert.include(error.message, 'invalid opcode', 'Participant can not halt.');
			auction.setHalted(true, { from: ADMIN});
			return auction.halted.call();
		}).then(function(halted) {
			assert.isTrue(halted, "Admin should halt.");
			auction.setHalted(false, { from: ADMIN});
			return auction.halted.call();
		}).then(function(halted) {
			assert.isFalse(halted, "Admin should unhalt.");
		});
	});
});
