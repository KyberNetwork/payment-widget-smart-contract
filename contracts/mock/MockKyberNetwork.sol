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
    uint constant public RATE = (10 ** 18) / 4;
    uint constant public PRECISION = (10 ** 18);
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    function () public payable {}

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
        uint returnAmount;

        if (src == ETH_TOKEN_ADDRESS) require(msg.value == srcAmount);
        else {
            src.transferFrom(msg.sender, address(this), srcAmount);
        }

        destAmount = srcAmount * PRECISION / RATE;
        (destAmount, returnAmount) = forceMaxDestAmount(destAmount, maxDestAmount, srcAmount);

        if(dest == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(destAmount);
        } else {
            require(dest.transfer(destAddress, destAmount));
        }

        if (returnAmount > 0) {
            if (src == ETH_TOKEN_ADDRESS) {
                msg.sender.transfer(returnAmount);
            } else {
                src.transfer(msg.sender, returnAmount);
            }
        }

        return destAmount;

        //destAmount = srcAmount * RATE / PRECISION;
    }

    function forceMaxDestAmount(uint prevDestAmount, uint maxDestAmount, uint srcAmount)
    internal
    returns (uint destAmount, uint returnAmount) {
        destAmount = prevDestAmount;
        returnAmount = 0;

        if(maxDestAmount < destAmount) {
            destAmount = maxDestAmount;
            uint usedSrcAmount = srcAmount * maxDestAmount / prevDestAmount;
            returnAmount = srcAmount - usedSrcAmount;
        }
    }
}
