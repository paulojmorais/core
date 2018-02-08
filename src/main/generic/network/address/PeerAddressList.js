class PeerAddressList {
    /**
     * @constructor
     */
    constructor() {
        /**
         * Set of PeerAddressStates of all peerAddresses we know.
         * @type {HashMap.<PeerAddress, PeerAddressState>}
         * @private
         */
        this._store = new HashMap();

        /**
         * Map from peerIds to RTC peerAddresses.
         * @type {HashMap.<PeerId,PeerAddressState>}
         * @private
         */
        this._peerIds = new HashMap();

        // Number of WebSocket/WebRTC peers.
        /** @type {number} */
        this._peerCountWs = 0;
        /** @type {number} */
        this._peerCountRtc = 0;
        /** @type {number} */
        this._peerCountDumb = 0;

        /**
         * Number of ongoing outbound connection attempts.
         * @type {number}
         * @private
         */
        this._connectingCount = 0;
    }

    /**
     * @param {PeerAddress} peerAddress
     * @returns {PeerAddress|null}
     */
    get(peerAddress) {
        /** @type {PeerAddressState} */
        return this._get(peerAddress);
    }

    /**
     * @param {PeerAddress} peerAddress
     * @returns {?PeerAddressState}
     * @private
     */
    _get(peerAddress) {
        if (peerAddress instanceof WsPeerAddress) {
            const localPeerAddress = this._store.get(peerAddress.withoutId());
            if (localPeerAddress) return localPeerAddress;
        }
        return this._store.get(peerAddress);
    }

    /**
     * @param {PeerAddress} peerAddress
     * @returns {PeerAddress|null}
     */
    getPeerAddress(peerAddress) {
        /** @type {PeerAddressState} */
        const peerAddressState = this._store.get(peerAddress);
        return peerAddressState ? peerAddressState.peerAddress : null;
    }

    /**
     * @param {PeerAddressState} peerAddressState
     */
    add(peerAddressState) {
        this._store.put(peerAddressState.peerAddress, peerAddressState);
    }

    /**
     * @param {PeerAddress} peerAddress
     */
    remove(peerAddress) {
        this._store.remove(peerAddress);
    }

    /**
     * @returns {PeerAddress|null}
     */
    values() {
        return this._store.values();
    }

     /**
     * @param {PeerId} peerId
     * @param {PeerAddressState} peerAddressState
     */
    putPeerId(peerId, peerAddressState) {
        this._peerIds.put(peerId, peerAddressState);
    }

    /**
     * @param {PeerId} peerId
     */
    removePeerId(peerId) {
        this._peerIds.remove(peerId);
    }

    /**
     * @param {PeerId} peerId
     * @returns {PeerAddress|null}
     */
    getByPeerId(peerId) {
        /** @type {PeerAddressState} */
        const peerAddressState = this._peerIds.get(peerId);
        return peerAddressState ? peerAddressState.peerAddress : null;
    }

    /**
     * @param {PeerId} peerId
     * @returns {PeerChannel}
     */
    getChannelByPeerId(peerId) {
        const peerAddressState = this._peerIds.get(peerId);
        if (peerAddressState && peerAddressState.bestRoute) {
            return peerAddressState.bestRoute.signalChannel;
        }
        return null;
    }

    /**
     * @param {PeerAddress} peerAddress
     * @param {number} delta
     * @returns {void}
     */
    updateConnectedPeerCount(peerAddress, delta) {
        switch (peerAddress.protocol) {
            case Protocol.WS:
                this._peerCountWs += delta;
                break;
            case Protocol.RTC:
                this._peerCountRtc += delta;
                break;
            case Protocol.DUMB:
                this._peerCountDumb += delta;
                break;
            default:
                Log.w(PeerAddressList, `Unknown protocol ${peerAddress.protocol}`);
        }
    }

    /** @type {number} */
    get peerCountWs() {
        return this._peerCountWs;
    }

    /** @type {number} */
    get peerCountRtc() {
        return this._peerCountRtc;
    }

    /** @type {number} */
    get peerCountDumb() {
        return this._peerCountDumb;
    }

    /** @type {number} */
    get peerCount() {
        return this._peerCountWs + this._peerCountRtc + this._peerCountDumb;
    }

    /** @type {number} */
    get connectingCount() {
        return this._connectingCount;
    }

    /** @param {number} */
    set connectingCount(value) {
        this._connectingCount = value;
    }
}
Class.register(PeerAddressList);
