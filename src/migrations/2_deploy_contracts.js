var MultiCertifier = artifacts.require("MultiCertifier");
var Token = artifacts.require("FrozenToken");
var Auction = artifacts.require("SecondPriceAuction");

const TREASURY = web3.eth.accounts[0];
const ADMIN = web3.eth.accounts[1];
const OWNER = web3.eth.accounts[2];
const TOTAL_SUPPLY = 10000000000;
const BEGIN_TIME = web3.eth.getBlock(web3.eth.blockNumber).timestamp + 1000;
const TOKEN_CAP = 5000000000;

module.exports = function(deployer) {
	deployer.deploy(Token, 10000000000, OWNER).then(function() {
		return deployer.deploy(MultiCertifier);
	}).then(function() {
		return deployer.deploy(Auction, MultiCertifier.address, Token.address, TREASURY, ADMIN, BEGIN_TIME, TOKEN_CAP);
	});
};
