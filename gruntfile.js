module.exports = function (grunt) {
    var Q = require('q');
	function createDeferedExec(cmdargs) {
		return function() {
			return Q.Promise(function(resolve, reject, notify) {
				grunt.util.spawn(cmdargs, function(error, result) {
					// if(result.stderr) {
						// // grunt.log.error(result.stderr + '\n');
						// reject(result.stderr);
					// } else {
						grunt.log.write(result.stdout + '\n');
						resolve(result.stdout);
					// }
				});
			});
		};
	}
	
    function execCmd(cmd, args, done) {
        grunt.util.spawn({
            cmd: cmd,
            args: args,
			// opts: {
				// stdio: 'inherit'
			// },
        }, function (error, result) {
            if (error || result.stderr) {
                grunt.log.error(error || result.stderr);
            } else {
                grunt.log.write(result);
				grunt.log.write('\n' + cmd + ' executed with exit code ' + result.code + '\n');
            }
            done();
        });
    }

    var workingDir = "dist/_build";
    var bannerSrc = workingDir + "/banner.js";

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),
        update_json: {
            // set some task-level options 
            options: {
                src: 'package.json',
                indent: '  '
            },
            bower: {
                src: 'package.json',    // where to read from 
                dest: 'bower.json',     // where to write to 
                // the fields to update, as a String Grouping 
                fields: {
                    "name" : "name",
                    "description" : "description",
                    "repository": "repository",
                    "main": function(src) { return 'dist/' + src.name + '-' + src.version + '.js';},
                    "moduleType" : null,
                    "license": "license",
                    "homepage": null,
                    "private": null,
                    "ignore": null
                }
            }
        },
        concat: {
            build: {
                src: [
                    bannerSrc,
                    "build/header.js",
                    "src/namespace.js",
                    "src/utils.js",
                    "src/subscriptions.js",
                    "src/binder.js",
                    "src/bindings/*.js",
                    "build/footer.js"
                ],
                dest: "dist/<%= pkg.name %>-<%= pkg.version %>.debug.js"
            }
        },
        uglify: {
            options: {
                banner: grunt.file.read("build/banner.tmpl")
            },
            build: {
                src: ["<%= concat.build.dest %>"],
                dest: "dist/<%= pkg.name %>-<%= pkg.version %>.js"
            }
        },
        jshint: {
            build: {
                options: {
                    '-W004': true
                },
                src: [
                    "<%= concat.build.dest %>"
                ]
            }
        },
        jasmine: {
            options: {
                //keepRunner: true,
                vendor: [
                    "node_modules/knockout/build/output/knockout-latest.js",
                    "http://maps.googleapis.com/maps/api/js?sensor=false&extension=.js"
                ],
                helpers: [
                    "test/jasmine.extensions.js"
                ],
                specs: ["test/Spec/**/*Spec.js"]
            },
            build: {
                src: ["<%= concat.build.dest %>"]
            }
        }
    });

    grunt.loadNpmTasks("grunt-contrib-concat");
    grunt.loadNpmTasks("grunt-contrib-uglify");
    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-contrib-jasmine");
    grunt.loadNpmTasks("grunt-update-json");

    grunt.registerTask("prepare", "Prepare the build", function () {
        grunt.file.mkdir(workingDir);
    });
    grunt.registerTask("generateBanner", "Generate the banner", function () {
        var bannerTmpl = grunt.file.read("build/banner.tmpl");
        var banner = grunt.template.process(bannerTmpl);
        grunt.file.write(bannerSrc, banner);
    });
    grunt.registerTask("nugetPack", "Create a NuGet package", function () {
        execCmd("nuget.exe", [
            //specify the .nuspec file
            "pack", "build/knockout.google.maps.nuspec",

            //specify where we want the package to be created
            "-OutputDirectory", "dist",

            // specify base path as project root directory
            "-BasePath", ".",

            //override the version with whatever is currently defined in package.json
            "-Version", grunt.config.get("pkg").version
        ], this.async());
    });
    grunt.registerTask("nugetPush", "Publish a NuGet package", function () {
        var args = ["push", "dist\\*.nupkg"];

        var apiKey = grunt.option("apiKey");
        if (apiKey) {
            args = args.concat(["-ApiKey", apiKey]);
        }

        execCmd("nuget.exe", args, this.async());
    });
    grunt.registerTask("clean", "Cleaning build directory", function () {
        grunt.file.delete(workingDir);
    });
    
    grunt.registerTask("bowerPush", "Publish to bower", function () {
        var version = grunt.config.get("pkg").version;
        var debugFile = grunt.config.get("concat").build.dest;
        var minFile = grunt.config.get("uglify").build.dest;
        var completion = this.async();
        createDeferedExec({cmd: "git", args: ["add", "bower.json"]})().then(
        createDeferedExec({cmd: "git", args: ["add", "-f", debugFile, minFile]})).then(
        createDeferedExec({cmd: "git", args: ["checkout", "head"]})).then(
        createDeferedExec({cmd: "git", args: ["commit", "-m", "'Version " + version + " for distribution'"]})).then(
        createDeferedExec({cmd: "git", args: ["tag", "-a", "v" + version,"-m", "'Add tag v" + version +"'"]})).then(
        createDeferedExec({cmd: "git", args: ["checkout", "master"]})).then(
        createDeferedExec({cmd: "git", args: ["push", "origin", "--tags"]})).done(completion);
    });

    grunt.registerTask("assemble", ["prepare", "generateBanner", "concat", "uglify", "clean"]);
    grunt.registerTask("runTest", ["jshint", "jasmine"]);
    grunt.registerTask("test", ["assemble", "runTest"]);
    grunt.registerTask("build", ["test", "nugetPack", "bowerPush"]);
    grunt.registerTask("publish", ["nugetPush"]);
    grunt.registerTask("buildAndPublish", ["build", "publish"]);

    grunt.registerTask("default", ["build"]);
};