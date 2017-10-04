var Token = artifacts.require("FrozenToken");

contract('token', function(accounts) {
	it("Liquid token.", function() {
		const OWNER = accounts[2];
		const PARTICIPANT = accounts[5];
		var token;
		return Token.deployed().then(function(instance) {
			token = instance;
			return token.totalSupply.call();
		}).then(function(cap) {
			assert.equal(cap.toNumber(), 10000000000, "Supply is all the tokens.");
			return token.balanceOf.call(OWNER);
		}).then(function(cap) {
			assert.equal(cap.toNumber(), 10000000000, "Owner has all the tokens.");
			token.transfer(PARTICIPANT, 10, { from: OWNER });
			return token.balanceOf.call(PARTICIPANT);
		}).then(function(balance) {
			assert.equal(balance.toNumber(), 10, "Participant has some tokens.");
			return token.transfer(OWNER, 10, { from: PARTICIPANT });
		}).then(assert.fail).catch(function(error) {
			assert.include(error.message, 'invalid opcode', 'Account is not liquid.');
			token.makeLiquid(PARTICIPANT, { from: OWNER });
			token.transfer(OWNER, 10, { from: PARTICIPANT });
			return token.balanceOf.call(PARTICIPANT);
		}).then(function(balance) {
			assert.equal(balance.toNumber(), 0, "Participant return the tokens.");
		});
	});
});
