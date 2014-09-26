describe('ngRepository', function() {

    var repositoryFactory;
    var repo;
    var result;
    var result1;
    var result2;

    var server = {};
    var thens = [];
    var itemResource = {};

    beforeEach(function() {
        // use the ngRepository module
        angular.mock.module('ngRepository');

        // inject the test target service
        angular.mock.inject(function(_repositoryFactory_) {
            repositoryFactory = _repositoryFactory_;
        });

        thens = [];

        itemResource = {};
        itemResource.get = function(params) {
            var response = {};
            response.$resolved = false;
            response.$promise = {
                then: function(callback) {
                    thens.push({
                        verb: 'get',
                        params: params,
                        callback: callback,
                        response: response
                    });
                }
            };
            return response;
        };

        collectionResource = {};
        collectionResource.query = function(params) {
            var response = [];
            response.$resolved = false;
            response.$promise = {
                then: function(callback) {
                    thens.push({
                        verb: 'query',
                        params: params,
                        callback: callback,
                        response: response
                    });
                }
            };
            return response;
        };

        server = {};
        server.respond = function (verb, params, serverResponse) {
            var then = _.find(thens, function(then) {
                return then.verb == verb && angular.equals(then.params, params);
            });

            if (then) {
                then.response.$resolved = true;
                if (_.isArray(serverResponse)) {
                    _.each(serverResponse, function(item) { then.response.push(item); });
                }
                else {
                    for (var k in serverResponse) then.response[k] = serverResponse[k];
                }
                then.callback(then.response);
                removeItemFromArray(thens, then);
            }
        };
    });

    describe('get()', function() {
        it('get() retrieves object from server by item key', function() {
            repo = repositoryFactory.create('testRepo', {
                itemResource: itemResource,
                itemKeyName: 'id'
            });

            result = repo.get({ id: 5 });
            expect(result.$resolved).toBe(false);

            server.respond('get', { id: 5 }, { id: 5, name: 'Bob' });
            expect(result.$resolved).toBe(true);
            expect(result.id).toBe(5);
            expect(result.name).toBe('Bob');
        });

        it('get() called a second time for same params will immediately return same item from cache', function() {
            repo = repositoryFactory.create('testRepo', {
                itemResource: itemResource,
                itemKeyName: 'id'
            });

            result1 = repo.get({ id: 5 });
            server.respond('get', { id: 5 }, { id: 5, name: 'Bob' });
            result2 = repo.get({ id: 5 });
            expect(result1 === result2).toBe(true);
        });
    });

    describe('getAll()', function() {
        it('getAll() retrieves list from server by collection key', function() {
            repo = repositoryFactory.create('testRepo', {
                itemResource: itemResource,
                itemKeyName: 'id',
                collectionResource: collectionResource,
                collectionKeyName: 'company_id'
            });

            result = repo.getAll({ company_id: 100 });
            expect(result.$resolved).toBe(false);

            server.respond('query', { company_id: 100 },
                [
                    { id: 5, company_id: 100, name: 'Bob' },
                    { id: 6, company_id: 100, name: 'Mary' }
                ]);
            expect(result.$resolved).toBe(true);
            expect(result.length).toBe(2);
            expect(result[0].id).toBe(5);
            expect(result[0].company_id).toBe(100);
            expect(result[0].name).toBe('Bob');
            expect(result[1].id).toBe(6);
            expect(result[1].company_id).toBe(100);
            expect(result[1].name).toBe('Mary');
        });

        it('getAll() called a second time for same params will immediately return same list from cache', function() {
            repo = repositoryFactory.create('testRepo', {
                itemResource: itemResource,
                itemKeyName: 'id',
                collectionResource: collectionResource,
                collectionKeyName: 'company_id'
            });

            result1 = repo.getAll({ company_id: 100 });

            server.respond('query', { company_id: 100 },
                [
                    { id: 5, company_id: 100, name: 'Bob' },
                    { id: 6, company_id: 100, name: 'Mary' }
                ]);

            result2 = repo.getAll({ company_id: 100 });
            expect(result1 === result2).toBe(true);
        });
    });

});



/*

describe('repositoryFactory', function() {

    beforeEach(function() {
        repo = null;
        result = null;
        thens = [];
        collectionResource = undefined;
        collectionKeyName = undefined;
        itemResource = undefined;
        itemKeyName = undefined;
        compareKeyName = undefined;
    });

    describe('non-parameterized collection resource and no item resource', function() {
        it('getAll() gets', function() {
            GivenSimpleCollection();
            GivenRepo();
            WhenGetAll();
            expect(result.length).toBe(0);
            WhenResolved();
            expect(result.length).toBe(3);
        });

        it('search() gets from search resource', function() {
            GivenSimpleCollection()
                .GivenSearchResource();
            GivenRepo();
            WhenSearch('gr');
            expect(result.length).toBe(0);
            WhenResolved();
            expect(result.length).toBe(1);
        });

        it('get() gets from cache if getAll() called first', function() {
            GivenSimpleCollection();
            GivenRepo();
            WhenGetAll(); // this should prime the cache
            WhenResolved();
            WhenGet({ id: 200 }); // should get out of the cache
            expect(result.name).toBe('foo2');
        });

        it('add() gets the new object', function() {
            GivenSimpleCollection();
            GivenRepo();
            WhenAdd({ name: 'Johnny' });
            expect(result.id).toBeUndefined();
            WhenResolved();
            expect(result.id).toBeDefined();
            expect(result.name).toBe('Johnny');
        });

        xit('add() creates a new cache if none', function() {
            GivenSimpleCollection();
            GivenRepo();
            WhenAdd({ name: 'Johnny', color: 'dark gray' }); // should add into cache
            WhenResolved();
            WhenServerEmptied();
            WhenGetAll(); // get the cache
            WhenResolved();
            expect(result[0].id).toBeDefined();
            expect(result[0].name).toBe('Johnny');
        });

        it('add() adds to the cache sorted by non-standard sort key', function() {
            GivenSimpleCollection();
            GivenSortKeyName('color');
            GivenRepo();
            WhenGetAll(); // start the cache
            WhenResolved();
            WhenAdd({ name: 'Johnny', color: 'dark gray' }); // should add into cache, sorted
            WhenResolved();
            WhenGetAll(); // get the cache
            WhenResolved();
            expect(result[0].color).toBe('blue');
            expect(result[1].color).toBe('dark gray');
            expect(result[2].color).toBe('green');
            expect(result[3].color).toBe('red');
        });
    });

    describe('non-parameterized collection resource and item resource', function() {
        it('get() gets even if not in cache', function() {
            GivenSimpleCollection()
                .GivenItemResource();
            GivenRepo();
            WhenGet({ id: 200 }); // should get from server because not in any cache
            WhenResolved();
            expect(result.name).toBe('foo2');
        });

        it('delete deletes the item', function(){
            GivenSimpleCollection()
                .GivenItemResource();
            GivenRepo();
            WhenDelete({ id: 200 });
            WhenResolved();
            WhenGet({ id: 200 });
            WhenResolved();
            expect(result.name).toBe(undefined);
        });

        xit('save() returns the updated existing object', function() {
            GivenSimpleCollection()
                .GivenItemResource();
            GivenRepo();
            WhenAdd({ name: 'Johnny' });
            WhenResolved();
            var id = result.id;
            expect(id).toBeDefined();
            result.name = 'Tommy';
            WhenSave(result);
            WhenResolved();
            expect(result.id).toBe(id);
            expect(result.name).toBe('Tommy');
        });

        xit('save() throws if given an object that was not returned by get()', function() {
            GivenSimpleCollection()
                .GivenItemResource();
            GivenRepo();
            WhenAdd({ name: 'Johnny' });
            WhenResolved();
            var ex;
            try {
                WhenSave({ id: result.id, name: 'Tommy'});
                WhenResolved();
            }
            catch(e) {
                ex = e;
            }
            expect(ex).toBe('testRepo.save(obj) method has been called with an object that did not come from the repository');
        });

    });

    describe('parameterized collection resource and no item resource', function() {
        it('getAll() gets by valid collection param', function() {
            GivenParameterizedCollection();
            GivenRepo();
            WhenGetAll({ base_id: 7 });
            expect(result.length).toBe(0);
            WhenResolved();
            expect(result.length).toBe(3);
        });

        it('getAll() gets nothing by invalid collection param', function() {
            GivenParameterizedCollection();
            GivenRepo();
            WhenGetAll({ base_id: -99 });
            expect(result.length).toBe(0);
            WhenResolved();
            expect(result.length).toBe(0);
        });

        it('get() gets from cache if getAll() called first', function() {
            GivenParameterizedCollection();
            GivenRepo();
            WhenGetAll({ base_id: 7 }); // this should prime the cache
            WhenResolved();
            WhenGet({ id: 200, base_id: 7 }); // should get out of the cache
            expect(result.name).toBe('foo2');
        });

        it('get() gets from cache if getAll() called first FOR DIFFERENT PARAM for a parameterized collection', function() {
            GivenParameterizedCollection();
            GivenRepo();
            WhenGetAll({ base_id: 7 }); // this should prime the cache
            WhenResolved();
            WhenGet({ id: 200, base_id: -99 }); // should search ALL caches and thus still find item
            expect(result.name).toBe('foo2');
        });

        it('add() gets the new object', function() {
            GivenParameterizedCollection();
            GivenRepo();
            WhenAdd({ name: 'Johnny', base_id: 7 });
            expect(result.id).toBeUndefined();
            WhenResolved();
            expect(result.id).toBeDefined();
            expect(result.name).toBe('Johnny');
        });
    });

    describe('parameterized collection resource and item resource', function() {
        it('get() gets even if not in cache', function() {
            GivenParameterizedCollection()
                .GivenItemResource();
            GivenRepo();
            WhenGet({ id: 200, base_id: 7 }); // should get from server because not in any cache
            WhenResolved();
            expect(result.name).toBe('foo2');
        });
    });


    var thens, repo, result, collectionResource, collectionKeyName, itemResource, itemKeyName, compareKeyName, searchResource;
    var _serverList = null;
    var _serverLists = null;

    function GivenSimpleCollection() {
        _serverList = [ { id: 100, name: 'foo1', color: 'blue' },
                        { id: 200, name: 'foo2', color: 'green' },
                        { id: 300, name: 'foo3', color: 'red' } ];
        collectionResource = {
            query: function() {
                var result = [];
                thens.push(function() {
                    _.each(_serverList, function(e) { result.push(e); });
                });
                result.$promise = { then: thens.push };
                return result;
            },
            save: function(obj, searchParams) {
                result = {};
                result.$promise = { then: function(fn) { thens.push(fn); } };
                _serverList.push(obj);
                thens.push(function() {
                    _.each(_.keys(obj), function(key) { result[key] = obj[key]; });
                    result.id = 100 + _.max(_serverList, function(e) { return e.id; }).id;
                });
                return result;
            }
        };

        itemKeyName = 'id';

        return {
            GivenItemResource: function() {
                itemResource = {
                    get: function(obj) {
                        result = {};
                        result.$promise = { then: function(fn) { thens.push(fn); } };
                        thens.push(function() {
                            found = _.find(_serverList, function(e) { return e.id == obj.id; });
                            if (found) _.each(_.keys(found), function(key) { result[key] = found[key]; });
                        });
                        return result;
                    },
                    save: function(obj, searchParams) {
                        result = {};
                        result.$promise = { then: function(fn) { thens.push(fn); } };
                        thens.push(function() {
                            _.find(_serverList, function(e) { return e.id == obj.id; });
                            _.each(_.keys(obj), function(key) { result[key] = obj[key]; });
                        });
                        return result;
                    },
                    delete: function(obj) {
                        thens.push(function() {
                            found = _.find(_serverList, function(e) { return e.id == obj.id; });
                            if (found) removeItemFromArray(_serverList, found);
                        });
                    }
                };
            },

            GivenSearchResource: function() {
                searchResource = {
                    query: function(params) {
                        var query = params.q;
                        var result = [];
                        thens.push(function() {
                            _.each(_serverList, function(e) {
                                if (e.color.indexOf(query) != -1) result.push(e);
                            });
                        });
                        result.$promise = { then: function(fn) { thens.push(fn); } };
                        return result;
                    }
                };
            }
        }
    }

    function GivenParameterizedCollection() {
        _serverLists = {};
        _serverLists[7] = [   { base_id: 7, id: 100, name: 'foo1', color: 'blue' },
                        { base_id: 7, id: 200, name: 'foo2', color: 'green' },
                        { base_id: 7, id: 300, name: 'foo3', color: 'red' } ];
        collectionResource = {
            query: function(params) {
                var result = [];
                thens.push(function() {
                    _.each(_serverLists[params.base_id], function(e) { result.push(e); });
                });
                result.$promise = { then: function(fn) { thens.push(fn); } };
                return result;
            },
            save: function(obj) {
                result = {};
                result.$promise = { then: function(fn) { thens.push(fn); } };
                var _serverList = _serverLists[obj.base_id];
                if (_serverList) {
                    _serverList.push(obj);
                    thens.push(function() {
                        _.each(_.keys(obj), function(key) { result[key] = obj[key]; });
                        result.id = 100 + _.max(_serverList, function(e) { return e.id; });
                    });
                }
                return result;
            }
        };
        collectionKeyName = 'base_id';
        itemKeyName = 'id';

        return {
            GivenItemResource: function() {
                itemResource = {
                    get: function(obj) {
                        result = {};
                        result.$promise = { then: function(fn) { thens.push(fn); } };
                        var _serverList = _serverLists[obj.base_id];
                        thens.push(function() {
                            found = _.find(_serverList, function(e) { return e.id == obj.id; });
                            if (found) _.each(_.keys(found), function(key) { result[key] = found[key]; });
                        });
                        return result;
                    }
                };
            }
        }
    }

    function GivenSortKeyName(name) {
        compareKeyName = name;
    }

    function GivenRepo() {
        repo = repositoryFactory.create('testRepo', {
            collectionResource: collectionResource,
            collectionKeyName: collectionKeyName,
            searchResource: searchResource,
            itemResource: itemResource,
            itemKeyName: itemKeyName,
            compareKeyName: compareKeyName,
            searchResource: searchResource
        });
    }

    function WhenGetAll(params) {
        thens = [];
        result = repo.getAll(params);
    }

    function WhenSearch(q) {
        thens = [];
        result = repo.search(q);
    }

    function WhenGet(params) {
        thens = [];
        result = repo.get(params);
    }

    function WhenDelete(params) {
        thens = [];
        repo.delete(params);
    }

    function WhenAdd(params) {
        thens = [];
        result = repo.add(params);
    }

    function WhenSave(params) {
        result = repo.save(params);
    }

    function WhenResolved() { _.each(thens, function(fn) { fn(); })}

    function WhenServerEmptied() {
        // for testing that caching does not hit the server!
        _serverList = [];
        _serverLists = {};
    }

});
*/
