class TransactionUi extends Nimiq.Observable {
    constructor(el, $) {
        super();
        this.$el = el;
        this.$ = $;
        this._transactionType = null;

        this.$typeSelector = this.$el.querySelector('[tx-type-selector]');

        this._senderUi = new SenderUi(el.querySelector('[sender-ui]'), $);

        this.$recipient = this.$el.querySelector('[tx-recipient]');
        this.$recipientType = this.$el.querySelector('[tx-recipient-type]');
        this.$value = this.$el.querySelector('[tx-value]');
        this.$fee = this.$el.querySelector('[tx-fee]');
        this.$validityStart = this.$el.querySelector('[tx-validity-start]');
        this.$flags = this.$el.querySelector('[tx-flags]');
        this.$data = this.$el.querySelector('[tx-data]');
        this.$proof = this.$el.querySelector('[tx-proof]');

        this._vestingOwner = new AccountSelector(this.$el.querySelector('[tx-vesting-owner]'), $);
        this.$vestingStepBlocks = this.$el.querySelector('[tx-vesting-step-blocks]');
        this.$vestingStepAmount = this.$el.querySelector('[tx-vesting-step-amount]');
        this.$vestingStart = this.$el.querySelector('[tx-vesting-start]');
        this.$vestingTotalAmount = this.$el.querySelector('[tx-vesting-total-amount]');

        this._htlcSender = new AccountSelector(this.$el.querySelector('[tx-htlc-sender]'), $);
        this._htlcRecipient = new AccountSelector(this.$el.querySelector('[tx-htlc-recipient]'), $);
        this.$htlcHashAlgo = this.$el.querySelector('[tx-htlc-hash-algo]');
        this.$htlcHashPreImage = this.$el.querySelector('[tx-htlc-hash-pre-image]');
        this.$htlcHashCount = this.$el.querySelector('[tx-htlc-hash-count]');
        this.$htlcTimeout = this.$el.querySelector('[tx-htlc-timeout]');

        this.$contractAddress = this.$el.querySelector('[contract-address]');
        this.$sendButton = this.$el.querySelector('[tx-send]');
        this.$clearButton = this.$el.querySelector('[tx-clear]');

        $.consensus.on('established', () => this.$sendButton.removeAttribute('disabled'));
        $.consensus.on('lost', () => this.$sendButton.setAttribute('disabled', ''));
        this.$typeSelector.addEventListener('change', () => this._onTransactionTypeSelected());
        this.$sendButton.addEventListener('click', e => this._sendTransaction(e));
        this.$clearButton.addEventListener('click', e => this._clear(e));
        this.$recipient.addEventListener('input', () => this._onRecipientChanged());

        this.$validityStart.setAttribute('placeholder', this._getDefaultValidityStart());
        $.blockchain.on('head-changed',
            () => this.$validityStart.setAttribute('placeholder', this._getDefaultValidityStart()));

        this._onTransactionTypeSelected();
    }

    notifyAccountsChanged() {
        this._senderUi.notifyAccountsChanged();
        this._vestingOwner.notifyAccountsChanged();
        this._htlcSender.notifyAccountsChanged();
        this._htlcRecipient.notifyAccountsChanged();
    }

    _onTransactionTypeSelected() {
        const txType = this.$typeSelector.value;
        if (Object.values(TransactionUi.TxType).indexOf(txType) === -1) {
            alert(`Unknown transaction type ${txType}`);
            return;
        }
        this._transactionType = txType;
        this.$el.setAttribute(TransactionUi.ATTRIBUTE_TX_TYPE, txType);
        this._senderUi.setSenderTypesToOffer(txType === TransactionUi.TxType.BASIC? [SenderUi.SenderType.WALLET]
            : [SenderUi.SenderType.WALLET, SenderUi.SenderType.VESTING_ACCOUNT, SenderUi.SenderType.HTLC_ACCOUNT]);
    }

    _onRecipientChanged() {
        const recipient = Utils.readAddress(this.$recipient);
        if (recipient === null) return;
        Utils.getAccount($, recipient).then(account => {
            const type = Object.keys(Nimiq.Account.Type)
                .filter(key => Nimiq.Account.Type[key] === account.type)[0]
                .toLowerCase();
            this.$recipientType.value = type;
        });
    }

    _sendTransaction(e) {
        e.preventDefault();

        let tx;
        this._senderUi.getSender().then(sender => {
            if (!sender) throw Error('Failed to retrieve sender.');
            tx = this._createTransaction(sender);
            if (!tx) throw Error('Failed to generate transaction.');
            return sender.sign(tx);
        }).then(() => Utils.broadcastTransaction(this.$, tx)).then(() => {
            if (tx.hasFlag(Nimiq.Transaction.Flag.CONTRACT_CREATION)) {
                const contractAddress = tx.getContractCreationAddress();
                this.$contractAddress.textContent = contractAddress.toUserFriendlyAddress();
                this.fire('contract-created', contractAddress);
            }
        });
    }

    _readTransactionCanonicals() {
        let value = Utils.readNumber(this.$value);
        let fee = Utils.readNumber(this.$fee);
        let validityStart;
        if (this.$validityStart.value === '') {
            validityStart = this._getDefaultValidityStart();
            this.$validityStart.classList.remove('error');
        } else {
            validityStart = Utils.readNumber(this.$validityStart);
        }
        if (value === null || fee === null || validityStart === null) return null;
        value = Nimiq.Policy.coinsToSatoshis(value);
        fee = Nimiq.Policy.coinsToSatoshis(fee);
        return {
            value: value,
            fee: fee,
            validityStart: validityStart
        };
    }

    _getDefaultValidityStart() {
        return this.$.blockchain.height + 1;
    }

    _clear(e) {
        e.preventDefault();
        Array.prototype.forEach.call(this.$el.querySelectorAll('input,select'), input => {
            input.value = '';
            input.classList.remove('error');
        });
        this.$contractAddress.textContent = '';
    }

    _createTransaction(sender) {
        switch(this._transactionType) {
            case TransactionUi.TxType.BASIC:
                return this._createBasicTransaction(sender);
            case TransactionUi.TxType.GENERAL:
                return this._createGeneralTransaction(sender);
            case TransactionUi.TxType.EXTENDED:
                return this._createPlainExtendedTransaction(sender);
            case TransactionUi.TxType.VESTING:
                return this._createVestingCreationTransaction(sender);
            case TransactionUi.TxType.HTLC:
                return this._createHtlcCreationTransaction(sender);
            default:
                alert('Transaction Type not implemented yet');
                return null;
        }
    }

    _createBasicTransaction(sender) {
        const canonicals = this._readTransactionCanonicals();
        const recipient = Utils.readAddress(this.$recipient);
        if (canonicals === null || recipient === null) return null;
        return new Nimiq.BasicTransaction(sender.publicKey, recipient,
            canonicals.value, canonicals.fee, canonicals.validityStart);
    }

    _createGeneralTransaction(sender) {
        const canonicals = this._readTransactionCanonicals();
        const recipient = Utils.readAddress(this.$recipient);
        const recipientType = Nimiq.Account.Type[this.$recipientType.value.toUpperCase()];
        if (canonicals === null || recipient === null || recipientType === undefined) return null;
        return new Nimiq.ExtendedTransaction(sender.address, sender.type, recipient, recipientType, canonicals.value,
            canonicals.fee, canonicals.validityStart, Nimiq.Transaction.Flag.NONE, new Uint8Array(0));
    }

    _createPlainExtendedTransaction(sender) {
        const canonicals = this._readTransactionCanonicals();
        const recipient = Utils.readAddress(this.$recipient);
        const recipientType = Nimiq.Account.Type[this.$recipientType.value.toUpperCase()];
        const flags = Utils.readNumber(this.$flags);
        const data = Utils.readBase64(this.$data);
        const proof = Utils.readBase64(this.$proof);
        if (canonicals === null || recipient === null || recipientType === undefined || flags === null
            || data === null || proof === null) {
            return null;
        }
        return new Nimiq.ExtendedTransaction(sender.address, sender.type, recipient, recipientType,
            canonicals.value, canonicals.fee, canonicals.validityStart, flags, data, proof);
    }

    _createVestingCreationTransaction(sender) {
        const canonicals = this._readTransactionCanonicals();
        const vestingOwner = this._vestingOwner.selectedAddress;
        const vestingStepBlocks = Utils.readNumber(this.$vestingStepBlocks);
        if (canonicals === null || vestingOwner === null || vestingStepBlocks === null) return null;

        const requiresVestingTotalAmount = this.$vestingTotalAmount.value !== '';
        const requiresVestingStartAndStepAmount = this.$vestingStart.value !== ''
            || this.$vestingStepAmount.value !== '' || requiresVestingTotalAmount;

        const bufferSize = vestingOwner.serializedSize + /* vestingStepBlocks*/ 4
            + (requiresVestingStartAndStepAmount? /* vestingStart */ 4 + /* vestingStepAmount */ 8 : 0)
            + (requiresVestingTotalAmount? /* vestingTotalAmount */ 8 : 0);

        let vestingStart, vestingStepAmount, vestingTotalAmount;

        if (requiresVestingStartAndStepAmount) {
            vestingStart = Utils.readNumber(this.$vestingStart);
            vestingStepAmount = Utils.readNumber(this.$vestingStepAmount);
            if (vestingStart === null || vestingStepAmount === null) return null;
            vestingStepAmount = Nimiq.Policy.coinsToSatoshis(vestingStepAmount);
        }
        if (requiresVestingTotalAmount) {
            vestingTotalAmount = Utils.readNumber(this.$vestingTotalAmount);
            if (vestingTotalAmount === null) return null;
            vestingTotalAmount = Nimiq.Policy.coinsToSatoshis(vestingTotalAmount);
        }

        const buffer = new Nimiq.SerialBuffer(bufferSize);
        vestingOwner.serialize(buffer);

        if (requiresVestingStartAndStepAmount) {
            buffer.writeUint32(vestingStart);
            buffer.writeUint32(vestingStepBlocks);
            buffer.writeUint64(vestingStepAmount);
            if (requiresVestingTotalAmount) {
                buffer.writeUint64(vestingTotalAmount);
            }
        } else {
            buffer.writeUint32(vestingStepBlocks);
        }

        const recipient = Nimiq.Address.CONTRACT_CREATION;
        const recipientType = Nimiq.Account.Type.VESTING;
        const flags = Nimiq.Transaction.Flag.CONTRACT_CREATION;
        return new Nimiq.ExtendedTransaction(sender.address, sender.type, recipient, recipientType,
            canonicals.value, canonicals.fee, canonicals.validityStart, flags, buffer);
    }

    _createHtlcCreationTransaction(sender) {
        const canonicals = this._readTransactionCanonicals();
        const htlcSender = this._htlcSender.selectedAddress;
        const htlcRecipient = this._htlcRecipient.selectedAddress;
        const hashAlgo = Nimiq.Hash.Algorithm[this.$htlcHashAlgo.value.toUpperCase()];
        const hashCount = Utils.readNumber(this.$htlcHashCount);
        const timeout = Utils.readNumber(this.$htlcTimeout);
        if (canonicals === null || htlcSender === null || htlcRecipient === null || hashAlgo === undefined
            || hashCount === null || timeout === null) return null;

        let hashRoot = Nimiq.BufferUtils.fromAscii(this.$htlcHashPreImage.value);
        for (let i = 0; i < hashCount; ++i) {
            hashRoot = Utils.hash(hashRoot, hashAlgo);
        }

        const bufferSize = htlcSender.serializedSize
            + htlcRecipient.serializedSize
            + /* hashAlgo */ 1
            + hashRoot.byteLength
            + /* hashCount */ 1
            + /* timeout */ 4;
        const buffer =  new Nimiq.SerialBuffer(bufferSize);
        htlcSender.serialize(buffer);
        htlcRecipient.serialize(buffer);
        buffer.writeUint8(hashAlgo);
        buffer.write(hashRoot);
        buffer.writeUint8(hashCount);
        buffer.writeUint32(timeout);

        const recipient = Nimiq.Address.CONTRACT_CREATION;
        const recipientType = Nimiq.Account.Type.HTLC;
        const flags = Nimiq.Transaction.Flag.CONTRACT_CREATION;
        return new Nimiq.ExtendedTransaction(sender.address, sender.type, recipient, recipientType,
            canonicals.value, canonicals.fee, canonicals.validityStart, flags, buffer);
    }
}
TransactionUi.ATTRIBUTE_TX_TYPE = 'tx-type';
TransactionUi.TxType = {
    EXTENDED: 'extended',
    BASIC: 'basic',
    GENERAL: 'general',
    VESTING: 'vesting-creation',
    HTLC: 'htlc-creation'
};
