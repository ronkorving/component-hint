var fs = require('fs');
var path = require('path');
var async = require('async');

var helpers = require('../helpers.js');


/**
 * 
 * @param {type} pathsList
 * @param {type} cb
 * @returns {undefined}
 */
function ensurePathsExist(parentPath, pathsList, cb) {
	var pathErrors = {};

	async.forEach(pathsList, function (pathItem, callback) {
		var componentPath = path.resolve(parentPath, pathItem);
		fs.stat(componentPath, function (error, stats) {
			if (error) {
				// Make sure the path exists
				pathErrors[pathItem] = 'Path does not exist: ' + pathItem;
				return callback();
			}

			if (!stats.isDirectory()) {
				// Make sure the path is a directory
				pathErrors[pathItem] = 'Path is not a directory: ' + pathItem;
				return callback();
			}

			return callback();
		});
	}, function () {
		var lintErrors = [];

		// Remove problem paths from path list
		for (var pathItem in pathErrors) {
			pathsList.splice(pathsList.indexOf(pathItem), 1);
			lintErrors.push(pathErrors[pathItem]);
		}

		// Return lint errors
		return cb(null, lintErrors);
	});
}


/**
 * 
 * @param {type} dependency
 * @param {type} componentPath
 * @param {type} componentPaths
 * @param {type} lookupPaths
 * @param {type} cb
 * @returns {undefined}
 */
function resolveDependencyPaths(dependency, componentPath, componentPaths, lookupPaths, cb) {
	var lintErrors = [];
	var depPaths = [];

	async.series([
		function (callback) {
			// Check each path for existence of this component
			async.forEach(componentPaths, function (lookupPath, lookupCb) {
				var depPath = path.resolve(componentPath, lookupPath, dependency);
				var checkPath = path.join(depPath, 'component.json');
				fs.exists(checkPath, function (exists) {
					if (exists) {
						depPaths.push(depPath);
					}
					return lookupCb();
				});
			}, callback);
		},
		function (callback) {
			// Check that dependency exists in a path
			if (depPaths.length > 0) {
				return callback();
			}

			// If not throw a lint error
			lintErrors.push('Could not find dep "' + dependency + '" in any of the given paths');

			// Check lookup paths to give the user a hint
			async.forEach(lookupPaths, function (lookupPath, lookupCb) {
				var checkPath = path.resolve(lookupPath, dependency, 'component.json');
				fs.exists(checkPath, function (exists) {
					if (exists) {
						lintErrors.push('Found it in Lookup Path "' + path.relative(componentPath, lookupPath) + '"');
					}
					return lookupCb();
				});
			}, callback);
		},
		function (callback) {
			// Check that path doesnt exist in more than 1 path
			if (depPaths.length > 1) {
				lintErrors.push('Found dependency "' + dependency + '" in more than one path:');
				lintErrors.push(depPaths);

				// Clear the depth paths list, since this is not valid for recursion
				depPaths = [];
			}

			return callback();
		}
	], function () {
		return cb(null, lintErrors, depPaths);
	});
}


/**
 * 
 * @param {type} componentPath
 * @param {type} componentData
 * @param {type} cb
 * @returns {undefined}
 */
exports.test = function (componentPath, componentData, cb) {
	var lookupPaths = componentData.lookupPaths || [];
	var localDeps = componentData.ComponentJSON.local || [];
	var componentPaths = componentData.ComponentJSON.paths || [];
	var resolvedDeps = [];

	async.series([
		function (callback) {
			// Check that each path actually exists
			ensurePathsExist(componentPath, componentPaths, callback);
		},
		function (callback) {
			// Try to resolve the dependency paths
			var errors = [];
			async.forEach(localDeps, function (depName, checkCb) {
				resolveDependencyPaths(depName, componentPath, componentPaths, lookupPaths, function (error, lintErrors, depPaths) {
					// Push in any lint errors
					errors.push(lintErrors);

					// If there are valid resolved deps, add them
					if (depPaths.length) {
						resolvedDeps.push(depPaths[0]);
					}

					checkCb();
				});
			}, function () {
				return callback(null, errors);
			});
		}
	], function (error, lintErrors) {
		// Flatten async.series results
		lintErrors = helpers.flattenArray(lintErrors)
		return cb(null, lintErrors, resolvedDeps);
	});
};