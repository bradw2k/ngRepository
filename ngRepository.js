/*
    ngRepository

    Supplies implementation for simple caching repositories which wrap around $resource objects.
    Internally uses the query(), get(), and save() "class" methods of the $resource objects.
    
    Results are normally cached, therefore not suitable for server resources which are expected
    to be changed by others during app usage, unless the noCache option is used.

    If collectionResource is not parameterized, then there is one cached list.  If it IS
    parameterized, then there is a cache list per collectionKey[collectionKey2...]

    An item retrieved by get() or created by add() will ONLY be cached if a getAll() has
    already created the appropriate cache.  This is because a cache is defined as that collection
    which would be returned by a call to getAll().

    search() takes the search string as only parameter to be plugged into searchResource as
    parameter 'q'.  search() does not read from or write to the cache.

    options:
        collectionResource: required for getAll() and add()
                            if parameterized:
                                1) collectionKeyName must be specified, and
                                2) params passed to any method must contain a value for collectionKeyName

        collectionKeyName:  required if collectionResource is a $resource that takes a parameter

        collectionKey2Name,
        collectionKey3Name,
        collectionKey4Name: collectionResource may take additional parameters

        collectionKeyDecorator:
                            function used to pre-process params[itemKeyName] before using it in
                            collectionResource.query(params) and collectionResource.save(params),
                            and itemResource.save(params)

        itemResource:       normally required for get() (although get() will succeed if it finds
                            item in something cached by call the getAll())

        itemKeyName:        always required, this is the name of the key of each item

        searchResource:     required for search(), must take parameter 'q' which is the query parameter (search string)

        compareKeyName:     name of the key to sort by during an add(); defaults to 'name'

        itemKeyDecorator:   function used to pre-process params[itemKeyName] before using it in itemResource.get(params)

        itemDecorator:      function used to post-process an item as soon as it is resolved from the resource

        noCache:            repository will not cache anything

        usesSaveForNewItem: set to true for a repo in which add() is not used because new items are not created
                            by POST'ing to the collection resource, rather they are created by using save()
                            and POST'ing to the item resource (typically because the item URL can be determined client-side)
*/
angular.module('ngRepository', []).factory('repositoryFactory', [function() {

    return { create: function(repoName, options) {
        var collectionResource      = options.collectionResource;
        var collectionKeyName       = options.collectionKeyName;
        var collectionKey2Name      = options.collectionKey2Name;
        var collectionKey3Name      = options.collectionKey3Name;
        var collectionKey4Name      = options.collectionKey4Name;
        var collectionKeyDecorator  = options.collectionKeyDecorator || function(k) { return k; };
        var searchResource          = options.searchResource;
        var itemResource            = options.itemResource;
        var itemKeyName             = options.itemKeyName;
        var compareKeyName          = options.compareKeyName || (collectionResource ? 'name' : options.itemKeyName);
        var itemKeyDecorator        = options.itemKeyDecorator;
        var itemDecorator           = options.itemDecorator;
        var noCache                 = options.noCache;
        var usesSaveForNewItem      = options.usesSaveForNewItem;

        // cached lists are stored with params[collectionKeyName] as the key (where params may be
        // the params passed to *any* of the methods in the repo) if there is no collectionKeyName
        // specified, then the one cached list is stored with key 'defaultCachedList'
        var cache = {};

        if (!itemKeyName && itemResource) throw repoName + ': options.itemKeyName is undefined';

        return {
            // WTH?
            cache: function() {
                return cache;
            },

            flushCache: function() {
                cache = {};
            },

            getAll: function(params) {
                if (params && !collectionKeyName) console.log('Warning: ' + repoName + '.getAll(params) method has been called with params but no collectionKeyName has been specified for the repo');

                if (_.isString(params) || _.isNumber(params)) {
                    p = params;
                    params = {};
                    params[collectionKeyName] = p;
                    if (collectionKey2Name) console.log('Warning: ' + repoName + '.getAll(params) method has been called with a simple parameter, but collectionKey2Name must be specified to use this repo');
                }

                var list = getList(params);

                // note that cache lists of singly-loaded items must not be used by getAll, because such is a not a full collection
                // only a real collection query creates a valid list to cache for the next getAll() call
                if (!list || !list.loadedByGetAll) {
                    var deferred = resourceOperation(params, collectionResource, 'query', collectionKeyDecorator, options.collectionKeyName);
                    whenLoaded(deferred, decorateItem);
                    list = setList(params, deferred);
                    list.loadedByGetAll = true;
                }

                return list;
            },

            search: function(query) {
                var deferred = resourceOperation({ q: query }, searchResource, 'query');
                whenLoaded(deferred, decorateItem);
                return deferred;
            },

            get: function(params) {
                if (!itemKeyName) throw repoName + '.get(params) method has been called but no itemKeyName has been specified for the repo';

                if (_.isString(params) || _.isNumber(params)) {
                    p = params;
                    params = {};
                    params[itemKeyName] = p;
                }

                var found = getExisting(params);
                if (found) return found;

                if (!itemResource) {
                    console.log('Warning: ' + repoName + '.get(params) called but itemResource has not been specified; loading full list from collectionResource instead');
                    return getItemFromCollectionResource(params);
                }

                var deferred = resourceOperation(params, itemResource, 'get', itemKeyDecorator, options.itemKeyName);
                whenLoaded(deferred, function() {
                    decorateItem(deferred);
                    cacheItem(deferred);
                });
                return deferred;
            },

            add: function(obj) {
                if (usesSaveForNewItem) throw repoName + '.add(params) method has been called but this repo should use save() for new items';
                var created = resourceOperation(obj, collectionResource, 'save', collectionKeyDecorator, options.collectionKeyName);
                whenLoaded(created, function() {
                    decorateItem(created);
                    cacheItem(created);
                });
                return created;
            },

            save: function(obj) {
                if (!usesSaveForNewItem) assertNotTryingToSaveCopy(obj);
                var saved = resourceOperation(obj, itemResource, 'save', itemKeyDecorator, options.itemKeyName);
                whenLoaded(saved, function() {
                    populateAsync(saved, obj);
                    decorateItem(obj);
                    cacheItem(obj);
                });

                obj.$promise = saved.$promise;
                obj.$resolved = saved.$resolved;
                if (obj.$promise && obj.$promise.finally) obj.$promise.finally(function() { obj.$resolved = true; });

                return obj; // return same object that was passed in!
            },

            delete: function(obj) {
                var rtn = resourceOperation(obj, itemResource, 'delete', itemKeyDecorator, options.itemKeyName);
                removeFromCache(obj);
                return rtn;
            }
        };

        function getItemFromCollectionResource(params) {
            var thens = [];
            var deferred = {
                $promise: { then: function(fn) { thens.push(fn); } },
                $resolved: false,
                resolve: function(e) { _.each(thens, function(fn) { fn(e); }); thens = []; deferred.$resolved = true; }
            };

            // load everything
            var getAllParams;
            if (collectionKeyName) {
                getAllParams = {};
                getAllParams[collectionKeyName] = params[collectionKeyName];
                if (collectionKey2Name) getAllParams[collectionKey2Name] = params[collectionKey2Name];
                if (collectionKey3Name) getAllParams[collectionKey3Name] = params[collectionKey3Name];
                if (collectionKey4Name) getAllParams[collectionKey4Name] = params[collectionKey4Name];
            }

            var list = this.getAll(getAllParams);
            whenLoaded(list, function() {
                // find the only one we are interested in,
                // copy its guts to the deferred object we already returned to caller,
                // and resolve the deferred object
                var found = _.find(list, function(e) { return e[itemKeyName] == params[itemKeyName]; });
                _.each(_.keys(found), function(key) { deferred[key] = found[key]; });
                deferred.resolve(deferred);
            });

            return deferred;
        }

        function getExisting(params) {            
            var list = getList(params);
            if (list) {
                var keyVal = params[itemKeyName];
                var found = findInCache(params, keyVal);
                if (found) return found;
            }
            else {
                // specific cached list cannot be found, search through all cached lists
                var foundItem;
                _.find(_.keys(cache), function (cacheKey) {
                    list = cache[cacheKey];
                    return foundItem = _.find(list, function(item) {
                        return item[itemKeyName] == params[itemKeyName];
                    });
                });
                if (foundItem) return foundItem;
            }
            return undefined;
        }

        function assertNotTryingToSaveCopy(obj) {
            if (noCache) return;
            var list = getList(obj);
            if (list) {
                var existing = _.find(list, function(a) { return a[itemKeyName] == obj[itemKeyName]; });
                if (existing && existing !== obj) throw repoName + '.save(obj) method has been called with an object other than the one loaded by the repository';
            }
        }

        function resourceOperation(params, resource, method, decorator, keyName) {
            if (decorator && params) {
                var p = _.clone(params);
                p[keyName] = decorator(params[keyName]);
                return resource[method](p);
            }
            else {
                return resource[method](params);
            }
        }

        function getList(params) {
            if (noCache) return null;
            var cacheKey = getCacheKey(params);
            return cache[cacheKey];
        }

        function setList(params, l) {
            if (noCache) return l;
            var cacheKey = getCacheKey(params);
            var priorCache = cache[cacheKey];
            cache[cacheKey] = l;

            // if there was a prior cache list, it contains items that may already be in use (bound) by client code so these prior objects need to be preserved in the cache
            // therefore we replace any matching newly loaded items with the prior items, copying the fresher properties from the new objects to the priors
            if (priorCache) {
                whenLoaded(l, function() {
                    _.each(priorCache, function(priorCachedItem) {
                        var removedNewItem = removeFromCache(priorCachedItem);
                        if (removedNewItem) copyProperties(removedNewItem, priorCachedItem);
                        cacheItem(priorCachedItem);
                    });
                });
            }

            return cache[cacheKey];
        }

        function getCacheKey(params) {
            if (!collectionKeyName) return 'defaultCachedList';
            if (params[collectionKeyName] === undefined) return undefined;
            cacheKey = collectionKeyDecorator(params[collectionKeyName].toString());
            if (collectionKey2Name) {
                cacheKey += '~~';
                if (params[collectionKey2Name]) cacheKey += params[collectionKey2Name].toString();

                if (collectionKey3Name) {
                    cacheKey += '~~';
                    if (params[collectionKey3Name]) cacheKey += params[collectionKey3Name].toString();

                    if (collectionKey4Name) {
                        cacheKey += '~~';
                        if (params[collectionKey4Name]) cacheKey += params[collectionKey4Name].toString();
                    }
                }
            }
            if (!cacheKey) return 'defaultCachedList';
            return cacheKey;
        }

        function cacheItem(obj) {
            if (noCache) return;
            if (itemKeyName && findInCache(obj, obj[itemKeyName])) return;
            var list = getList(obj);
            if (!list) setList(obj, list = []);
            list.push(obj);
            sortList(list);
        }

        function decorateItem(arr) {
            if (!itemDecorator) return;
            if (!_.isArray(arr)) arr = [arr];
            _.each(arr, itemDecorator);
        }

        function sortList(list) {
            list.sort(function(a, b) {
                var aVal = a[compareKeyName];
                var bVal = b[compareKeyName];
                if (aVal == undefined || bVal == undefined) {
                    console.log('ERROR: compareKeyName of "' + compareKeyName + '" is invalid for repo ' + repoName);
                    return 0;
                }
                if (_.isString(aVal) || _.isString(bVal)) {
                    aVal = aVal.toString().toLowerCase();
                    bVal = bVal.toString().toLowerCase();
                    return aVal.localeCompare(bVal);
                }
                if (aVal < bVal) return 1;
                if (aVal > bVal) return -1;
                return 0;
            });
        }

        function removeFromCache(params) {
            if (noCache) return null;
            var list = getList(params);
            if (list) {
                var found = _.find(list, function(e) { return e[itemKeyName] == params[itemKeyName]; });
                if (found) removeItemFromArray(list, found);
                return found;
            }
            return null;
        }

        function findInCache(params, keyVal) {
            if (noCache || !keyVal) return undefined;
            return _.find(getList(params), function(e) { return e[itemKeyName] == keyVal; });
        }
    }};

}]);
