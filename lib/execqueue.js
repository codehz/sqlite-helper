"use strict";

module.exports = class ExecQueue {
    constructor() {
        this.wait = true;
        this.queue = [];
    }

    exec(task) {
        if (this.wait) return this.queue.push(task);
        task();
    }

    ready() {
        this.wait = false;
        while (this.queue.length) this.queue.shift()();
    }
};