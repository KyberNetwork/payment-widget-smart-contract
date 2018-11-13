pragma solidity 0.4.18;

import "./ERC20Interface.sol";
import "./Withdrawable.sol";
import "./ReentrancyGuard.sol";

interface KyberNetwork {
    function tradeWithHint(
        address trader,
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId,
        bytes hint
    )
        external
        payable
        returns(uint);
}

contract KyberPayWrapper is Withdrawable, ReentrancyGuard{
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    uint constant internal MAX_QTY = (10**28); // 10B tokens

    event ProofOfPayment(address _beneficiary, address _token, uint _amount, bytes _data);

    function pay(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId,
        bytes paymentData,
        bytes hint,
        KyberNetwork kyberNetworkProxy
    ) public payable
    {

        uint paidAmount;
        uint returnAmount;
        uint wrapperDstBalanceBefore;
        uint destAddressBalanceBefore;
        uint wrapperDstBalanceAfter;
        uint destAddressBalanceAfter;

        require(src != address(0));
        require(dest != address(0));
        require(destAddress != address(0));

		require(srcAmount <= MAX_QTY);
		require(maxDestAmount <= MAX_QTY);
		
		if (src == ETH_TOKEN_ADDRESS) require(srcAmount == msg.value);

        if(src == dest) {
			if(srcAmount > maxDestAmount) {
			    paidAmount = maxDestAmount;
			    returnAmount = srcAmount - maxDestAmount; // no underflow, both not larger than MAX_QTY
			} else {
			    paidAmount = srcAmount;
			    returnAmount = 0;
			}
			
			if (src == ETH_TOKEN_ADDRESS) {
			    destAddress.transfer(paidAmount);
				// return change
				if (returnAmount > 0) srcAddress.transfer(returnAmount);
			} else {
			    // no need to to return change since using transferfrom() directly to dest
			    require(src.transferFrom(msg.sender, destAddress, paidAmount));
			}
        }
        else {
			(wrapperDstBalanceBefore, destAddressBalanceBefore) = getBalances(dst, destAddress);

            if(src != ETH_TOKEN_ADDRESS) {
                require(src.transferFrom(msg.sender,this,srcAmount));
                require(src.approve(kyberNetworkProxy,0));
                require(src.approve(kyberNetworkProxy,srcAmount));
            }

            paidAmount = kyberNetworkProxy.trade.value(msg.value)(
                src,
                srcAmount,
                dest,
                destAddress,
                maxDestAmount,
                minConversionRate,
                walletId,
                hint
            );

            require(src.approve(kyberNetworkProxy,0));

			(wrapperDstBalanceAfter, destAddressBalanceAfter) = getBalances(dst, destAddress);

			// verify the amount the user got is same as returned from Kyber Network
			require(destAddressBalanceAfter > destAddressBalanceBefore);
			require(paidAmount == (destAddressBalanceAfter - destAddressBalanceBefore));

			// calculate the returned change amount
			require(wrapperDstBalanceAfter >= wrapperDstBalanceBefore);
			returnAmount = wrapperDstBalanceAfter - wrapperDstBalanceBefore;

			// return to sender the returned change
			if (returnAmount > 0) {
			    if (dst == ETH_TOKEN_ADDRESS) srcAddress.transfer(returnAmount);
			    else require(dst.transfer(msg.sender, returnAmount);
			}
		}

        // log as event
        emit ProofOfPayment(msg.sender, dest, paidAmout, paymentData);
    }

	function getBalances (address dst, address destAddress)
		internal
		returns (uint wrapperDstBalance, uint destAddressBalance)
	{
        if (dst == ETH_TOKEN_ADDRESS) {
        	wrapperDstBalance = this.balance;
        	destAddressBalance = destAddress.balance;
        } else {
            wrapperDstBalance = dst.balanceOf(this);
        	destAddressBalance = dst.balanceOf(destAddress);
        }
	} 

}