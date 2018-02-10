class SignalRoute {
    /**
     * @constructor
     * @param {PeerChannel} signalChannel
     * @param {number} distance
     * @param {number} timestamp
     */
    constructor(signalChannel, distance, timestamp) {
        this.failedAttempts = 0;
        this.timestamp = timestamp;
        this._signalChannel = signalChannel;
        this._distance = distance;
    }

    /** @type {PeerChannel} */
    get signalChannel() {
        return this._signalChannel;
    }

    /** @type {number} */
    get distance() {
        return this._distance;
    }

    /** @type {number} */
    get score() {
        return ((PeerAddressOperator.MAX_DISTANCE - this._distance) / 2) * (1 - (this.failedAttempts / PeerAddressOperator.MAX_FAILED_ATTEMPTS_RTC));
    }

    /**
     * @param {SignalRoute} o
     * @returns {boolean}
     */
    equals(o) {
        return o instanceof SignalRoute
            && this._signalChannel.equals(o._signalChannel);
    }

    /**
     * @returns {string}
     */
    hashCode() {
        return this._signalChannel.hashCode();
    }

    /**
     * @returns {string}
     */
    toString() {
        return `SignalRoute{signalChannel=${this._signalChannel}, distance=${this._distance}, timestamp=${this.timestamp}, failedAttempts=${this.failedAttempts}}`;
    }
}
Class.register(SignalRoute);
