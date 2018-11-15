pragma solidity ^0.4.22;

interface ERC20 {
    function totalSupply() external view returns (uint supply);
    function balanceOf(address _owner) external view returns (uint balance);
    function transfer(address _to, uint _value) external returns (bool success);
    function transferFrom(address _from, address _to, uint _value) external returns (bool success);
    function approve(address _spender, uint _value) external returns (bool success);
    function allowance(address _owner, address _spender) external view returns (uint remaining);
    function decimals() external view returns(uint digits);
    event Approval(address indexed _owner, address indexed _spender, uint _value);
}

contract MockKyberNetwork {
    uint constant public RATE = (10 ** 18) / 1; // 1 -> 4
    uint constant public PRECISION = (10 ** 18);
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    function tradeWithHint(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId,
        bytes hint)
    external
    payable
    returns(uint) {

		uint destAmount;

		if (src == ETH_TOKEN_ADDRESS) {
		    require(dest != ETH_TOKEN_ADDRESS);
		    require(msg.value == srcAmount);

			destAmount = srcAmount * PRECISION / RATE;
			dest.transfer( destAddress, destAmount);
	
		} else {
		    require(dest == ETH_TOKEN_ADDRESS);

		    destAmount = srcAmount * RATE / PRECISION;
		    destAddress.transfer(destAmount);
		}
		
		return destAmount;
	}
}
