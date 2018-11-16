pragma solidity ^0.4.22;


import "./ERC20Interface.sol";
import "./Withdrawable.sol";
import "./ReentrancyGuard.sol";


interface KyberNetwork {
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
    returns(uint);
}


contract KyberPayWrapper is Withdrawable, ReentrancyGuard {
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    struct PayData {
        ERC20 src;
        uint srcAmount;
        ERC20 dest;
        address destAddress;
        uint maxDestAmount;
        uint minConversionRate;
        address walletId;
        bytes paymentData;
        bytes hint;
        KyberNetwork kyberNetworkProxy;
    }

    function () public payable {}

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

        require(src != address(0));
        require(dest != address(0));
        require(destAddress != address(0));

        if (src == ETH_TOKEN_ADDRESS) require(srcAmount == msg.value);

        PayData memory payData = PayData(
            src,
            srcAmount,
            dest,
            destAddress,
            maxDestAmount,
            minConversionRate,
            walletId,
            paymentData,
            hint,
            kyberNetworkProxy
        );

        uint paidAmount = (src == dest) ? doPayWithoutKyber(payData) : doPayWithKyber(payData);

        // log as event
        emit ProofOfPayment(destAddress, dest, paidAmount, paymentData);
    }

    function doPayWithoutKyber(PayData memory payData) internal returns (uint paidAmount) {

        uint returnAmount;

        if (payData.srcAmount > payData.maxDestAmount) {
            paidAmount = payData.maxDestAmount;
            returnAmount = payData.srcAmount - payData.maxDestAmount;
        } else {
            paidAmount = payData.srcAmount;
            returnAmount = 0;
        }

        if (payData.src == ETH_TOKEN_ADDRESS) {
            payData.destAddress.transfer(paidAmount);

            // return change
            if (returnAmount > 0) msg.sender.transfer(returnAmount);
        } else {
            require(payData.src.transferFrom(msg.sender, payData.destAddress, paidAmount));
        }
    }

    function doPayWithKyber(PayData memory payData) internal returns (uint paidAmount) {

        uint returnAmount;
        uint wrapperSrcBalanceBefore;
        uint destAddressBalanceBefore;
        uint wrapperSrcBalanceAfter;
        uint destAddressBalanceAfter;
        uint srcAmountUsed;

        if (payData.src != ETH_TOKEN_ADDRESS) {
            require(payData.src.transferFrom(msg.sender, address(this), payData.srcAmount));
            require(payData.src.approve(payData.kyberNetworkProxy, 0));
            require(payData.src.approve(payData.kyberNetworkProxy, payData.srcAmount));
        }


        (wrapperSrcBalanceBefore, destAddressBalanceBefore) = getBalances(payData.src, payData.dest, payData.destAddress);

        paidAmount = doTradeWithHint(payData);
        if (payData.src != ETH_TOKEN_ADDRESS) require(payData.src.approve(payData.kyberNetworkProxy, 0));

        (wrapperSrcBalanceAfter, destAddressBalanceAfter) = getBalances(payData.src, payData.dest, payData.destAddress);

        // verify the amount the user got is same as returned from Kyber Network
        require(destAddressBalanceAfter > destAddressBalanceBefore);
        require(paidAmount == (destAddressBalanceAfter - destAddressBalanceBefore));

        // calculate the returned change amount
        require(wrapperSrcBalanceBefore >= wrapperSrcBalanceAfter);
        srcAmountUsed = wrapperSrcBalanceBefore - wrapperSrcBalanceAfter;

        require(payData.srcAmount >= srcAmountUsed);
        returnAmount = payData.srcAmount - srcAmountUsed;

        // return to sender the returned change
        if (returnAmount > 0) {
            if (payData.src == ETH_TOKEN_ADDRESS) msg.sender.transfer(returnAmount);
            else {
                require(payData.src.transfer(msg.sender, returnAmount));
            }
        }
    }

    function doTradeWithHint(PayData memory payData) internal returns (uint paidAmount) {
        paidAmount = payData.kyberNetworkProxy.tradeWithHint.value(msg.value)(
            payData.src,
            payData.srcAmount,
            payData.dest,
            payData.destAddress,
            payData.maxDestAmount,
            payData.minConversionRate,
            payData.walletId,
            payData.hint
        );
    }

    function getBalances (ERC20 src, ERC20 dest, address destAddress)
        internal
        view
        returns (uint wrapperSrcBalance, uint destAddressBalance)
    {
        if (src == ETH_TOKEN_ADDRESS) wrapperSrcBalance = address(this).balance;
        else wrapperSrcBalance = src.balanceOf(address(this));

        if (dest == ETH_TOKEN_ADDRESS) destAddressBalance = destAddress.balance;
        else destAddressBalance = dest.balanceOf(destAddress);
    } 
}