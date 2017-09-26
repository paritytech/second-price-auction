//! By Parity Team (Ethcore), 2016.
//! Released under the Apache Licence 2.

pragma solidity ^0.4.7;

// https://github.com/ethereum/EIPs/issues/20
contract ERC20 {
	function totalSupply() constant returns (uint totalSupply);
	function balanceOf(address _owner) constant returns (uint balance);
	function transfer(address _to, uint _value) returns (bool success);
	function transferFrom(address _from, address _to, uint _value) returns (bool success);
	function approve(address _spender, uint _value) returns (bool success);
	function allowance(address _owner, address _spender) constant returns (uint remaining);
	event Transfer(address indexed _from, address indexed _to, uint _value);
	event Approval(address indexed _owner, address indexed _spender, uint _value);
}

// From Owned.sol
contract Owned {
	event NewOwner(address indexed old, address indexed current);

	modifier only_owner {
		require (msg.sender == owner);
		_;
	}

	address public owner = msg.sender;

	function setOwner(address _new) only_owner {
		NewOwner(owner, _new);
		owner = _new;
	}
}

// FrozenCoin, ECR20 tokens that all belong to the owner for sending around
contract FrozenToken is Owned, ERC20 {
	string public constant name = "Frozen Token";
	string public constant symbol = "FRZ";
	uint8 public constant decimals = 3;

	// this is as basic as can be, only the associated balance & allowances
	struct Account {
		uint balance;
		bool liquid;
	}

	// the balance should be available
	modifier when_owns(address _owner, uint _amount) {
		require (accounts[_owner].balance >= _amount);
		_;
	}

	// no ETH should be sent with the transaction
	modifier when_no_eth {
		require (msg.value == 0);
		_;
	}

	modifier when_liquid(address who) {
		require (accounts[who].liquid);
		_;
	}

	// a value should be > 0
	modifier when_non_zero(uint _value) {
		require (_value > 0);
		_;
	}

	// available token supply
	uint public totalSupply;

	// storage and mapping of all balances & allowances
	mapping (address => Account) accounts;

	// constructor sets the parameters of execution, _totalSupply is all units
	function FrozenToken(uint _totalSupply, address _owner) when_no_eth when_non_zero(_totalSupply) {
		totalSupply = _totalSupply;
		owner = _owner;
		accounts[_owner].balance = totalSupply;
		accounts[_owner].liquid = true;
	}

	// balance of a specific address
	function balanceOf(address _who) constant returns (uint256) {
		return accounts[_who].balance;
	}

	// make an account liquid: only liquid accounts can do this.
	function makeLiquid(address _to)
		when_no_eth
		when_liquid(msg.sender)
		returns(bool)
	{
		accounts[_to].liquid = true;
		return true;
	}

	// transfer
	function transfer(address _to, uint256 _value)
		when_no_eth
		when_owns(msg.sender, _value)
		when_liquid(msg.sender)
		returns(bool)
	{
		Transfer(msg.sender, _to, _value);
		accounts[msg.sender].balance -= _value;
		accounts[_to].balance += _value;

		return true;
	}

	// no default function, simple contract only, entry-level users
	function() { assert(false); }
}
