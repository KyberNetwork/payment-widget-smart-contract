pragma solidity 0.4.18;


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

interface KyberPayWrapper {
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
    )
    external
    payable
    returns(uint);
}

contract MockReentrantKyberNetwork {

    KyberNetwork public realNetwork;
    uint timesHere = 0;

    function MockReentrantKyberNetwork(KyberNetwork _realNetwork) public {
        realNetwork = _realNetwork;
    }

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
        timesHere++;

        if(timesHere < 3) {
            // visit here 2 times
            bytes memory paymentData = "";
    
            KyberPayWrapper payWrapper = KyberPayWrapper(msg.sender);
            return payWrapper.pay.value(msg.value)(
                src,
                srcAmount,
                dest,
                destAddress,
                maxDestAmount,
                minConversionRate,
                walletId,
                paymentData,
                hint,
                KyberNetwork(address(this))
            );
        } else {
            // visit here on 3rd iteration
            return realNetwork.tradeWithHint.value(msg.value)(
                src,
                srcAmount,
                dest,
                destAddress,
                maxDestAmount,
                minConversionRate,
                walletId,
                hint
            );
        }
    }
}
