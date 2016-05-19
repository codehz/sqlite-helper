const assert = require('chai').assert;
const DB = require('../lib/db');
const co = require('co');

let db = null;
let createCommand = null;
let insertCommand = null;
let selectCommand = null;

describe('sqlite-helper', () => {
    describe('#constructor', () => {
        it('should not return null', done => {
            db = new DB('test.db');
            assert.isNotNull(db);
            done();
        });
    });

    describe('table', () => {
        describe('#createCommand', () => {
            it('should not return null', done => {
                createCommand = db._test.create()
                    ._id('INTEGER', {
                        primary: true,
                        unique: true
                    })
                    ._name('TEXT', {
                        default: 'test'
                    })
                    ._info('TEXT')
                    .build();
                assert.isNotNull(createCommand);
                done();
            });
            it('should work', done => {
                co(function*() {
                    yield createCommand.exec();
                }).then(done).catch(done);
            });
        });
        describe('#insertCommand', () => {
            it('should not return null', done => {
                insertCommand = db._test.insert('name', 'info')
                    .build();
                assert.isNotNull(insertCommand);
                done();
            });
            it('should work', done => {
                co(function*() {
                    yield insertCommand.exec();
                }).then(done).catch(done);
            });
        });
        describe('#selectCommand', () => {
            it('should not return null', done => {
                selectCommand = db._test.select('id', 'name', 'info')
                    .limit(10, 0)
                    .build();
                assert.isNotNull(selectCommand);
                done();
            });
            it('should work', done => {
                co(function*() {
                    console.log(yield selectCommand.exec());
                }).then(done).catch(done);
            });
        });
    });
});

console.log('log');