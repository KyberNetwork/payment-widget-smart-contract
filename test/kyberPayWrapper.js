const BigNumber = web3.BigNumber
const Helper = require("./helper.js");

const precision = (new BigNumber(10).pow(18));
const ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const ethAddressJS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const paymentData = "ThisIsPaymentData"
const paymentDataHex = "0x".concat(new Buffer(paymentData).toString('hex'));
const rate = 0.25

const KyberPayWrapper = artifacts.require("./KyberPayWrapper.sol")
const TestToken = artifacts.require("./mock/TestToken.sol");
const MockKyberNetwork = artifacts.require("./mock/MockKyberNetwork.sol");
const MockReentrantKyberNetwork = artifacts.require("./mock/MockReentrantKyberNetwork.sol");

async function getBalances(currency ,senderAddress, recieverAddress) {
    if( currency == ethAddress) {
        senderBalance = await Helper.getBalancePromise(senderAddress);
        recieverBalance = await Helper.getBalancePromise(recieverAddress);
    } else {
        senderBalance = await currency.balanceOf(senderAddress);
        recieverBalance = await currency.balanceOf(recieverAddress);
    }
    return [senderBalance, recieverBalance]
}

async function getGasCost(txInfo) {
    tx = await web3.eth.getTransaction(txInfo.tx);
    return tx.gasPrice.mul(txInfo.receipt.gasUsed); 
}

contract('KyberPayWrapper', function(accounts) {

    const admin = accounts[0];
    const reciever = accounts[1];
    const other = accounts[2];

    beforeEach('create contracts and deposit initial funds', async function () {
        payWrapper = await KyberPayWrapper.new();

        token1 = await TestToken.new("token1", "tok1", 18);
        token2 = await TestToken.new("token2", "tok2", 18);
        kyberNetwork = await MockKyberNetwork.new();

        // move some tokens to kyber network
        const kyberNetworkTok1InitAmount = precision.times(100)
        await token1.transfer(kyberNetwork.address, kyberNetworkTok1InitAmount)

        const kyberNetworkTok2InitAmount = precision.times(100)
        await token2.transfer(kyberNetwork.address, kyberNetworkTok2InitAmount)

        // move some ether to pay wrapper, just to make sure its existent does not affect returning change.
        const initialWrapperEthAmount = precision.times(0.003237)
        await Helper.sendEtherWithPromise(admin, payWrapper.address, initialWrapperEthAmount)

        // save balances
        senderEthBefore = await Helper.getBalancePromise(admin);
        senderTok1Before = await token1.balanceOf(admin);
        senderTok2Before = await token2.balanceOf(admin);

        recieverEthBefore = await Helper.getBalancePromise(reciever);
        recieverTok1Before = await token1.balanceOf(reciever);
        recieverTok2Before = await token2.balanceOf(reciever);
    });

    describe('eth to eth', function () {
        const amount = precision.mul(7)

        it("max dest amount is exactly src amount", async function () {
            txInfo = await payWrapper.pay(ethAddress, amount, ethAddress, reciever, amount, 0, 0, paymentData,
                                          0, kyberNetwork.address, {value: amount})

            let senderEthAfter, recieverEthAfter;
            expectedSenderLoss = amount.plus(await getGasCost(txInfo));
            [senderEthAfter, recieverEthAfter] =  await getBalances(ethAddress, admin, reciever);

            assert.equal(senderEthAfter.toString(), senderEthBefore.minus(expectedSenderLoss).toString())
            assert.equal(recieverEthAfter.toString(), recieverEthBefore.plus(amount).toString())
        });

        it("event is emitted correctly", async function () {
            const { logs } = await payWrapper.pay(ethAddress, amount, ethAddress, reciever, amount, 0, 0, paymentData,
                                                  0, kyberNetwork.address, {value: amount})

            assert.equal(logs.length, 1);
            assert.equal(logs[0].event, 'ProofOfPayment');
            assert.equal(logs[0].args._payer, admin);
            assert.equal(logs[0].args._payee, reciever);
            assert.equal(logs[0].args._token, ethAddressJS);
            assert.equal(logs[0].args._amount, amount.toString());
            assert.equal(logs[0].args._data, paymentDataHex);
        });

        it("max dest amount is smaller than src amount", async function () {
            const maxDstAmount = amount.times(0.8)
            txInfo = await payWrapper.pay(ethAddress, amount, ethAddress, reciever, maxDstAmount, 0, 0, paymentData,
                                          0, kyberNetwork.address, {value: amount})

            let senderEthAfter, recieverEthAfter;
            expectedSenderLoss = maxDstAmount.plus(await getGasCost(txInfo));
            [senderEthAfter, recieverEthAfter] =  await getBalances(ethAddress, admin, reciever);
            
            assert.equal(senderEthAfter.toString(), senderEthBefore.minus(expectedSenderLoss).toString())
            assert.equal(recieverEthAfter.toString(), recieverEthBefore.plus(maxDstAmount).toString())
        });

        it("max dest amount is larger than src amount", async function () {
            const maxDstAmount = amount.times(1.1)
            txInfo = await payWrapper.pay(ethAddress, amount, ethAddress, reciever, maxDstAmount, 0, 0, paymentData,
                                          0, kyberNetwork.address, {value: amount})

            let senderEthAfter, recieverEthAfter;
            expectedSenderLoss = amount.plus(await getGasCost(txInfo));
            [senderEthAfter, recieverEthAfter] =  await getBalances(ethAddress, admin, reciever);

            assert.equal(senderEthAfter.toString(), senderEthBefore.minus(expectedSenderLoss).toString())
            assert.equal(recieverEthAfter.toString(), recieverEthBefore.plus(amount).toString())
        });

        it("without sending enough eth", async function () {
            const amountToSend = amount.times(0.5)

            try {
                await payWrapper.pay(ethAddress, amount, ethAddress, reciever, amount, 0, 0, paymentData,
                                     0, kyberNetwork.address, {value: amountToSend})
            } catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });
    });

    describe('token to same token', function () {
        const amount = precision.mul(5);

        it("max dest amount is exactly src amount", async function () {
            await token1.approve(payWrapper.address, amount)
            await payWrapper.pay(token1.address, amount, token1.address, reciever, amount, 0, 0, paymentData,
                                 0, kyberNetwork.address)

            expectedSenderLoss = amount
            senderTokensAfter = await token1.balanceOf(admin);
            recieverTokensAfter = await token1.balanceOf(reciever);

            assert.equal(senderTokensAfter.toString(), senderTok1Before.minus(expectedSenderLoss).toString())
            assert.equal(recieverTokensAfter.toString(), recieverTok1Before.plus(amount).toString())
        });

        it("event is emitted correctly", async function () {
            await token1.approve(payWrapper.address, amount)
            const { logs } = await payWrapper.pay(token1.address, amount, token1.address, reciever, amount, 0, 0, paymentData,
                                                  0, kyberNetwork.address)

            assert.equal(logs.length, 1);
            assert.equal(logs[0].event, 'ProofOfPayment');
            assert.equal(logs[0].args._payer, admin);
            assert.equal(logs[0].args._payee, reciever);
            assert.equal(logs[0].args._token, token1.address);
            assert.equal(logs[0].args._amount, amount.toString());
            assert.equal(logs[0].args._data, paymentDataHex);
        });

        it("max dest amount is smaller than src amount", async function () {
            const maxDstAmount = amount.times(0.8)
            await token1.approve(payWrapper.address, amount)
            await payWrapper.pay(token1.address, amount, token1.address, reciever, maxDstAmount, 0, 0, paymentData,
                                 0, kyberNetwork.address)

            expectedSenderLoss = maxDstAmount;
            senderTokensAfter = await token1.balanceOf(admin);
            recieverTokensAfter = await token1.balanceOf(reciever);

            assert.equal(senderTokensAfter.toString(), senderTok1Before.minus(expectedSenderLoss).toString())
            assert.equal(recieverTokensAfter.toString(), recieverTok1Before.plus(maxDstAmount).toString())
        });

        it("max dest amount is larger than src amount", async function () {
            const maxDstAmount = amount.times(2.1)
            await token1.approve(payWrapper.address, amount)
            await payWrapper.pay(token1.address, amount, token1.address, reciever, maxDstAmount, 0, 0, paymentData,
                                 0, kyberNetwork.address)

            expectedSenderLoss = amount;
            senderTokensAfter = await token1.balanceOf(admin);
            recieverTokensAfter = await token1.balanceOf(reciever);

            assert.equal(senderTokensAfter.toString(), senderTok1Before.minus(expectedSenderLoss).toString())
            assert.equal(recieverTokensAfter.toString(), recieverTok1Before.plus(amount).toString())
        });

        it("verify allowance of pay wrapper is 0 after the payment", async function () {
            await token1.approve(payWrapper.address, amount)
            await payWrapper.pay(token1.address, amount, token1.address, reciever, amount, 0, 0, paymentData,
                                 0, kyberNetwork.address)
            const allowance = await token1.allowance(payWrapper.address, kyberNetwork.address);
            assert.equal(allowance, 0)
        });
    });

    describe('eth to token', function () {
        const amount = precision.mul(1.8);

        it("max dest amount is exactly as expected dest amount", async function () {
            const maxDestAmount = amount.times(1/rate);
            txInfo = await payWrapper.pay(ethAddress, amount, token1.address, reciever, maxDestAmount, 0, 0, paymentData,
                                          0, kyberNetwork.address, {value: amount})

            expectedSenderLoss = amount.plus(await getGasCost(txInfo));
            expectedRecierverGain = amount.times(1/rate);

            senderEthAfter = await Helper.getBalancePromise(admin);
            recieverTokensAfter = await token1.balanceOf(reciever);

            assert.equal(senderEthAfter.toString(), senderEthBefore.minus(expectedSenderLoss).toString())
            assert.equal(recieverTokensAfter.toString(), recieverTok1Before.plus(expectedRecierverGain).toString())
        });

        it("event is emitted correctly", async function () {
            const maxDestAmount = amount.times(1/rate);
            const { logs } = await payWrapper.pay(ethAddress, amount, token1.address, reciever, maxDestAmount, 0, 0, paymentData,
                                                  0, kyberNetwork.address, {value: amount})

            assert.equal(logs.length, 1);
            assert.equal(logs[0].event, 'ProofOfPayment');
            assert.equal(logs[0].args._payer, admin);
            assert.equal(logs[0].args._payee, reciever);
            assert.equal(logs[0].args._token, token1.address);
            assert.equal(logs[0].args._amount, maxDestAmount.toString());
            assert.equal(logs[0].args._data, paymentDataHex);
        });

        it("max dest amount is smaller than expected dest amount", async function () {
            const maxDestAmount = amount.times(1/rate).times(0.7);
            txInfo = await payWrapper.pay(ethAddress, amount, token1.address, reciever, maxDestAmount, 0, 0, paymentData,
                                 0, kyberNetwork.address, {value: amount})

            const expectedActualSrcAmount = amount.times(0.7);
            expectedSenderLoss = expectedActualSrcAmount.plus(await getGasCost(txInfo));
            expectedRecierverGain = maxDestAmount;

            senderEthAfter = await Helper.getBalancePromise(admin);
            recieverTokensAfter = await token1.balanceOf(reciever);

            assert.equal(senderEthAfter.toString(), senderEthBefore.minus(expectedSenderLoss).toString())
            assert.equal(recieverTokensAfter.toString(), recieverTok1Before.plus(expectedRecierverGain).toString())
        });

        it("max dest amount is larger than as expected dest amount", async function () {
            const maxDestAmount = amount.times(1/rate).times(1.4);
            txInfo = await payWrapper.pay(ethAddress, amount, token1.address, reciever, maxDestAmount, 0, 0, paymentData,
                    0, kyberNetwork.address, {value: amount})

            const expectedActualSrcAmount = amount;
            expectedSenderLoss = expectedActualSrcAmount.plus(await getGasCost(txInfo));
            expectedRecierverGain = amount.times(1/rate);
            
            senderEthAfter = await Helper.getBalancePromise(admin);
            recieverTokensAfter = await token1.balanceOf(reciever);
            
            assert.equal(senderEthAfter.toString(), senderEthBefore.minus(expectedSenderLoss).toString())
            assert.equal(recieverTokensAfter.toString(), recieverTok1Before.plus(expectedRecierverGain).toString())
        });
    });

    describe('token to eth', function () {
        const amount = precision.mul(0.05654);

        it("max dest amount is exactly as expected dest amount", async function () {

            // move some eth to kyber network
            const kyberNetworkEthInitAmount = precision.times(3)
            await Helper.sendEtherWithPromise(admin, kyberNetwork.address, kyberNetworkEthInitAmount)

            const maxDestAmount = amount.times(1/rate);
            await token1.approve(payWrapper.address, amount);
            await payWrapper.pay(token1.address, amount, ethAddress, reciever, maxDestAmount, 0, 0, paymentData,
                                 0, kyberNetwork.address, {value: amount})

            expectedSenderLoss = amount;
            expectedRecierverGain = amount.times(1/rate);

            senderTokensAfter = await token1.balanceOf(admin);
            recieverEthAfter = await Helper.getBalancePromise(reciever);

            assert.equal(senderTokensAfter.toString(), senderTok1Before.minus(expectedSenderLoss).toString())
            assert.equal(recieverEthAfter.toString(), recieverEthBefore.plus(expectedRecierverGain).toString())
        });

        it("event is emitted correctly", async function () {
            // move some eth to kyber network
            const kyberNetworkEthInitAmount = precision.times(3)
            await Helper.sendEtherWithPromise(admin, kyberNetwork.address, kyberNetworkEthInitAmount)

            const maxDestAmount = amount.times(1/rate);
            await token1.approve(payWrapper.address, amount);
            const { logs } = await payWrapper.pay(token1.address, amount, ethAddress, reciever, maxDestAmount, 0, 0, paymentData,
                                                  0, kyberNetwork.address, {value: amount})

            expectedRecierverGain = amount.times(1/rate);

            assert.equal(logs.length, 1);
            assert.equal(logs[0].event, 'ProofOfPayment');
            assert.equal(logs[0].args._payer, admin);
            assert.equal(logs[0].args._payee, reciever);
            assert.equal(logs[0].args._token, ethAddressJS);
            assert.equal(logs[0].args._amount, expectedRecierverGain.toString());
            assert.equal(logs[0].args._data, paymentDataHex);
        });

        it("max dest amount is smaller than expected dest amount", async function () {
            // move some eth to kyber network
            const kyberNetworkEthInitAmount = precision.times(3)
            await Helper.sendEtherWithPromise(admin, kyberNetwork.address, kyberNetworkEthInitAmount)

            const maxDestAmount = amount.times(1/rate).times(0.38);
            await token1.approve(payWrapper.address, amount);
            await payWrapper.pay(token1.address, amount, ethAddress, reciever, maxDestAmount, 0, 0, paymentData,
                                 0, kyberNetwork.address, {value: amount})

            expectedSenderLoss = amount.times(0.38);
            expectedRecierverGain = maxDestAmount;

            senderTokensAfter = await token1.balanceOf(admin);
            recieverEthAfter = await Helper.getBalancePromise(reciever);

            assert.equal(senderTokensAfter.toString(), senderTok1Before.minus(expectedSenderLoss).toString())
            assert.equal(recieverEthAfter.toString(), recieverEthBefore.plus(expectedRecierverGain).toString())
        });

        it("max dest amount is larger than expected dest amount", async function () {
            // move some eth to kyber network
            const kyberNetworkEthInitAmount = precision.times(3)
            await Helper.sendEtherWithPromise(admin, kyberNetwork.address, kyberNetworkEthInitAmount)

            const maxDestAmount = amount.times(1/rate).times(1.05);
            await token1.approve(payWrapper.address, amount);
            await payWrapper.pay(token1.address, amount, ethAddress, reciever, maxDestAmount, 0, 0, paymentData,
                                 0, kyberNetwork.address, {value: amount})

            expectedSenderLoss = amount;
            expectedRecierverGain = amount.times(1/rate);

            senderTokensAfter = await token1.balanceOf(admin);
            recieverEthAfter = await Helper.getBalancePromise(reciever);

            assert.equal(senderTokensAfter.toString(), senderTok1Before.minus(expectedSenderLoss).toString())
            assert.equal(recieverEthAfter.toString(), recieverEthBefore.plus(expectedRecierverGain).toString())
        });

        it("verify allowance of pay wrapper is 0 after the payment", async function () {
            // move some eth to kyber network
            const kyberNetworkEthInitAmount = precision.times(3)
            await Helper.sendEtherWithPromise(admin, kyberNetwork.address, kyberNetworkEthInitAmount)

            const maxDestAmount = amount.times(1/rate);
            await token1.approve(payWrapper.address, amount);
            await payWrapper.pay(token1.address, amount, ethAddress, reciever, maxDestAmount, 0, 0, paymentData,
                                 0, kyberNetwork.address, {value: amount})

            const allowance = await token1.allowance(payWrapper.address, kyberNetwork.address);
            assert.equal(allowance, 0)
        });
    });

    describe('token to another token', function () {
        const amount = precision.mul(0.612);

        it("max dest amount is exactly as expected dest amount", async function () {

            const maxDestAmount = amount.times(1/rate);
            await token1.approve(payWrapper.address, amount);
            await payWrapper.pay(token1.address, amount, token2.address, reciever, maxDestAmount, 0, 0, paymentData,
                                 0, kyberNetwork.address, {value: amount})

            expectedSenderLoss = amount;
            expectedRecierverGain = amount.times(1/rate);

            senderTokensAfter = await token1.balanceOf(admin);
            recieverTokensAfter = await token2.balanceOf(reciever);

            assert.equal(senderTokensAfter.toString(), senderTok1Before.minus(expectedSenderLoss).toString())
            assert.equal(recieverTokensAfter.toString(), recieverTok2Before.plus(expectedRecierverGain).toString())
        });

        it("event is emitted correctly", async function () {
            const maxDestAmount = amount.times(1/rate);
            await token1.approve(payWrapper.address, amount);
            const { logs } = await payWrapper.pay(token1.address, amount, token2.address, reciever, maxDestAmount, 0, 0, paymentData,
                                 0, kyberNetwork.address, {value: amount})

            expectedRecierverGain = amount.times(1/rate);

            assert.equal(logs.length, 1);
            assert.equal(logs[0].event, 'ProofOfPayment');
            assert.equal(logs[0].args._payer, admin);
            assert.equal(logs[0].args._payee, reciever);
            assert.equal(logs[0].args._token, token2.address);
            assert.equal(logs[0].args._amount, expectedRecierverGain.toString());
            assert.equal(logs[0].args._data, paymentDataHex);
        });

        it("max dest amount is smaller than expected dest amount", async function () {
            const maxDestAmount = amount.times(1/rate).times(0.321);
            await token1.approve(payWrapper.address, amount);
            await payWrapper.pay(token1.address, amount, token2.address, reciever, maxDestAmount, 0, 0, paymentData,
                                 0, kyberNetwork.address, {value: amount})

            expectedSenderLoss = amount.times(0.321);
            expectedRecierverGain = maxDestAmount;

            senderTokensAfter = await token1.balanceOf(admin);
            recieverTokensAfter = await token2.balanceOf(reciever);

            assert.equal(senderTokensAfter.toString(), senderTok1Before.minus(expectedSenderLoss).toString())
            assert.equal(recieverTokensAfter.toString(), recieverTok2Before.plus(expectedRecierverGain).toString())
        });

        it("max dest amount is larger than expected dest amount", async function () {
            const maxDestAmount = amount.times(1/rate).times(3.321);
            await token1.approve(payWrapper.address, amount);
            await payWrapper.pay(token1.address, amount, token2.address, reciever, maxDestAmount, 0, 0, paymentData,
                                 0, kyberNetwork.address, {value: amount})

            expectedSenderLoss = amount;
            expectedRecierverGain = amount.times(1/rate);

            senderTokensAfter = await token1.balanceOf(admin);
            recieverTokensAfter = await token2.balanceOf(reciever);

            assert.equal(senderTokensAfter.toString(), senderTok1Before.minus(expectedSenderLoss).toString())
            assert.equal(recieverTokensAfter.toString(), recieverTok2Before.plus(expectedRecierverGain).toString())
        });

        it("verify allowance of pay wrapper is 0 after the payment", async function () {
            const maxDestAmount = amount.times(1/rate);
            await token1.approve(payWrapper.address, amount);
            await payWrapper.pay(token1.address, amount, token2.address, reciever, maxDestAmount, 0, 0, paymentData,
                                 0, kyberNetwork.address, {value: amount})

            const allowance = await token1.allowance(payWrapper.address, kyberNetwork.address);
            assert.equal(allowance, 0)
        });
    });

    describe('check withdrawable as admin', function () {
        const amount = precision.mul(0.5);;

        it("can withdraw ether", async function () {
            // move some eth to pay wrapper
            await Helper.sendEtherWithPromise(admin, payWrapper.address, amount)

            const balanceBefore = await Helper.getBalancePromise(other)
            await payWrapper.withdrawEther(amount, other)
            const balanceAfter = await Helper.getBalancePromise(other)

            assert.equal(amount.toString(), balanceAfter.minus(balanceBefore).toString())
        });

        it("can withdraw tokens", async function () {
            // move some tokens to pay wrapper
            await token1.transfer(payWrapper.address, amount)

            const balanceBefore = await token1.balanceOf(other);
            await payWrapper.withdrawToken(token1.address, amount, other)
            const balanceAfter = await token1.balanceOf(other);

            assert.equal(amount.toString(), balanceAfter.minus(balanceBefore).toString())
        });
    });

    describe('check withdrawable as non admin', function () {
        const amount = precision.mul(0.5);;

        it("can not withdraw ether", async function () {
            // move some eth to pay wrapper
            await Helper.sendEtherWithPromise(admin, payWrapper.address, amount)

            try {
                await payWrapper.withdrawEther(amount, other, {from: other})
             } catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

        });

        it("can not withdraw tokens", async function () {
            // move some tokens to pay wrapper
            await token1.transfer(payWrapper.address, amount)

            try {
                await payWrapper.withdrawToken(token1.address, amount, other, {from: other})
             } catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });
    });

    describe('no reentrancy', function () {
        const amount = precision.mul(0.5);

        it("can not create reentrancy", async function () {
            const reentrantKyber = await MockReentrantKyberNetwork.new(kyberNetwork.address);

            const maxDestAmount = amount.times(1/rate);

            /* when returning in doPayWithKyber() right after doTradeWithHint the following revert only when using
             the nonReentrant modifier. */

            try {
                await payWrapper.pay(ethAddress, amount, token1.address, reciever, maxDestAmount, 0, 0, paymentData,
                                          0, reentrantKyber.address, {value: amount})
            } catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });
    });
});

