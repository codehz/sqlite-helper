# SQLITE HELPER
A simple sqlite helper library

```
const DB = require('sqlite-helper');
const co = require('co');

let db = new DB('test.db');

let createCommand = db._test.create()
    ._id('INTEGER', { primary: true, unique: true })
    ._name('TEXT', { default: 'test' })
    ._info('TEXT')
    .build();

co(function*() {
        yield createCommand.exec();
        console.log('createCommand');
        let insertCommand = db._test.insert('name', 'info')
            .build();
        let selectCommand = db._test.select('id', 'name', 'info')
            .limit(10, 0)
            .build();
        yield insertCommand.exec({ $name: 'TEST NAME', $info: 'INFO' });
        console.log(yield selectCommand.exec());
    })
    .catch(err => {
        console.log(err);
    });

```