"use strict";

const sqlite3 = require('sqlite3');
const ExecQueue = require('./execqueue');

class NameAlias {
    constructor(srcName, tgtName) {
        this.srcName = srcName;
        this.tgtName = tgtName;
    }

    get() {
        if (this.tgtName) return `${this.srcName} AS ${this.tgtName}`;
        else return this.srcName;
    }
}

class DBField {
    constructor(name, type, ext) {
        this.name = name;
        this.type = type;
        if (!ext) return;
        this.primary = ext.primary;
        this.unique = ext.unique;
        this.default = ext.default;
        this.notnull = ext.notnull;
        this.foreign = ext.foreign;
        this.foreign_field = ext.foreign_field;
    }
}

class DBRequest {
    constructor() {
        this.queue = new ExecQueue();
    }

    $run(func) {
        this.queue.exec(func);
    }

    $compile(stmt) {
        console.log('    SQL', stmt.sql);
        this.stmt = stmt;
        this.queue.ready();
    }

    $finalize() {
        this.stmt.finalize();
    }
}

class SelectRequest extends DBRequest {
    constructor(db, table, keys, wheres, orders, limit) {
        super();
        this.db = db;
        this.table = table;
        this.keys = keys;
        this.wheres = wheres;
        this.limit = limit;
        this.orders = orders;
    }

    get() {
        return ['SELECT', this.keys.map(key => key.get())
                .join(', '), 'FROM', this.table
            ]
            .concat(this.wheres instanceof Array && this.wheres.length > 0 ? ['WHERE', this.wheres.join(' AND ')] : [])
            .concat(this.orders ? ['ORDER', 'BY', this.orders[0].join(', '), this.orders[1]] : [])
            .concat(this.limit ? ['LIMIT', this.limit[0], 'OFFSET', this.limit[1]] : [])
            .join(' ') + ';';
    }

    exec(params) {
        return new Promise((resolve, reject) => {
            super.$run(() => this.stmt.all(params, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            }));
        });
    }
}

class InsertRequest extends DBRequest {
    constructor(db, table, keys) {
        super();
        this.db = db;
        this.table = table;
        this.keys = keys;
    }

    get() {
            return `INSERT INTO ${this.table} (${this.keys.join(',')}) VALUES (${this.keys.map(key => `\$${key}`)});`;
    }

    exec(params) {
        return new Promise((resolve, reject) => {
            super.$run(() => this.stmt.run(params, err => {
                if (err) reject(err);
                resolve();
            }));
        });
    }
}

class CreateRequest extends DBRequest {
    constructor(db, table, fields) {
        super();
        this.db = db;
        this.table = table;
        this.fields = fields;
    }

    get() {
            return `CREATE TABLE IF NOT EXISTS ${this.table} (${
            this.fields.map(field => [field.name, field.type]
                .concat(field.primary ? ['PRIMARY KEY'] : [])
                .concat(field.unique ? ['UNIQUE'] : [])
                .concat(field.notnull ? ['NOT', 'NULL'] : [])
                .concat(field.default ? ['DEFAULT', field.default] : [])
                .join(' '))
            .concat(this.fields.filter(field => field.foreign)
            .map(field => `FOREIGN KEY(${field.name}) REFERENCES ${field.foreign}(${field.foreign_field}) ON DELETE CASCADE`)).join(', ')
        });`;
    }

    exec() {
        return new Promise((resolve, reject) =>
            super.$run(() => this.stmt.run(err =>
                err ? reject(err) :
                resolve()
            )));
    }
}


class DeleteRequest extends DBRequest {
    constructor(db, table, wheres, limit) {
        super();
        this.db = db;
        this.table = table;
        this.wheres = wheres;
        this.limit = limit;
    }

    get() {
        return ['DELETE', 'FROM', this.table]
            .concat(this.wheres instanceof Array && this.wheres.length > 0 ? ['WHERE', this.wheres.join(' AND ')] : [])
            .concat(this.limit ? ['LIMIT', this.limit[0], 'OFFSET', this.limit[1]] : [])
            .join(' ') + ';';
    }

    exec(params) {
        return new Promise((resolve, reject) =>
            super.$run(() => this.stmt.run(params, err =>
                err ? reject(err) :
                resolve()
            )));
    }
}

class UpdateRequest extends DBRequest {
    constructor(db, table, keys, wheres) {
        super();
        this.db = db;
        this.table = table;
        this.keys = keys;
        this.wheres = wheres;
    }

    get() {
        return ['UPDATE', this.table, 'SET'].concat([this.keys.map(key => `${key}=\$${key}`).join(', ')])
            .concat(['WHERE'])
            .concat(this.wheres instanceof Array && this.wheres.length > 0 ? [this.wheres.join(' AND ')] : [])
            .join(' ') + ';';
    }

    exec(params) {
        return new Promise((resolve, reject) =>
            super.$run(() => this.stmt.run(params, err =>
                err ? reject(err) :
                resolve()
            )));
    }
}

const keyCvt = keys => keys.map(key => typeof key === 'string' ? new NameAlias(key) : key instanceof Array ? new NameAlias(key[0], key[1]) : null);

class SelectFactory {
    constructor(db, table, ...keys) {
        this.db = db;
        this.table = table;
        this.wheres = [];
        this.keys = keyCvt(keys[0]);
    }

    where(cond) {
        this.wheres.push(cond);
        return this;
    }

    limit(_limit, _offset) {
        this._limit = _limit;
        this._offset = _offset;
        return this;
    }

    autoLimit() {
        this._limit = '$limit';
        this._offset = '$offset';
        return this;
    }

    orderBy(column, asc) {
        this.order_column = column;
        this.order = asc ? 'ASC' : 'DESC';
        return this;
    }

    build() {
        let ret = new SelectRequest(this.db, this.table, this.keys, this.wheres, this.order && [this.order_column, this.order], this._limit && [this._limit, this._offset]);
        this.db.$compile(ret);
        return ret;
    }
}

function CreateFactory (db, table) {
    let obj = {};
    obj.db = db;
    obj.table = table;
    obj.fields = [];
    obj.build = () => {
        // console.log('compile');
        let ret = new CreateRequest(db, obj.table, obj.fields);
        db.$compile(ret);
        return ret;
    };
    const FieldHelper = name => (type, ext) => (obj.fields.push(new DBField(name, type, ext)), proxy);
    let proxy = new Proxy(obj, {
        get(target, property) {
            if (typeof property === 'string' && property.startsWith('_')) return FieldHelper(property.substr(1));
            return target[property];
        }
    });
    return proxy;
}

class DeleteFactory {
    constructor(db, table) {
        this.db = db;
        this.table = table;
        this.wheres = [];
    }

    where(cond) {
        this.wheres.push(cond);
        return this;
    }

    build() {
        let ret = new DeleteRequest(this.db, this.table, this.wheres);
        this.db.$compile(ret);
        return ret;
    }
}

class UpdateFactory {
    constructor(db, table, keys) {
        this.db = db;
        this.table = table;
        this.wheres = [];
        this.keys = keys;
    }

    where(cond) {
        this.wheres.push(cond);
        return this;
    }

    build() {
        let ret = new UpdateRequest(this.db, this.table, this.keys, this.wheres);
        this.db.$compile(ret);
        return ret;
    }
}

class SimpleBuild {
    constructor(db, ret) {
        this.db = db;
        this.ret = ret;
    }

    build() {
        this.db.$compile(this.ret);
        return this.ret;
    }
}

let DBMethods = (db, table) => ({
    select: (...keys) => new SelectFactory(db, table, keys),
    insert: (...keys) => new SimpleBuild(db, new InsertRequest(db, table, keys)),
    create: () => CreateFactory(db, table),
    delete: () => new DeleteFactory(db, table),
    update: (...keys) => new UpdateFactory(db, table, keys)
});

class DB {
    constructor(file) {
        this.queue = new ExecQueue();
        this.internal = new sqlite3.Database(file, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, error => {
            if (error) throw error;
            this.internal.run('PRAGMA foreign_keys = ON;');
            this.queue.ready();
        });
    }

    $compile(request) {
        this.queue.exec(() => request.$compile(this.internal.prepare(request.get())));
    }
}

function Database(file) {
    let db = new DB(file);

    return new Proxy(db, {
        get(target, property) {
            if (typeof property === 'string' && property.startsWith('_')) return DBMethods(db, property.substr(1));
            return target[property];
        }
    });
}

module.exports = Database;
