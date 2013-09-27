var tt = angular.module('TeamTest', [], function ($httpProvider) {
    // Use x-www-form-urlencoded Content-Type
    $httpProvider.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded;charset=utf-8';

    // Override $http service's default transformRequest
    $httpProvider.defaults.transformRequest = [function (data) {
        /**
         * The workhorse; converts an object to x-www-form-urlencoded serialization.
         * @param {Object} obj
         * @return {String}
         */
        var param = function (obj) {
            var query = '';
            var name, value, fullSubName, subName, subValue, innerObj, i;

            for (name in obj) {
                value = obj[name];

                if (value instanceof Array) {
                    for (i = 0; i < value.length; ++i) {
                        subValue = value[i];
                        fullSubName = name + '[' + i + ']';
                        innerObj = {};
                        innerObj[fullSubName] = subValue;
                        query += param(innerObj) + '&';
                    }
                }
                else if (value instanceof Object) {
                    for (subName in value) {
                        subValue = value[subName];
                        fullSubName = name + '[' + subName + ']';
                        innerObj = {};
                        innerObj[fullSubName] = subValue;
                        query += param(innerObj) + '&';
                    }
                }
                else if (value !== undefined && value !== null) {
                    query += encodeURIComponent(name) + '=' + encodeURIComponent(value) + '&';
                }
            }
            return query.length ? query.substr(0, query.length - 1) : query;
        };

        return angular.isObject(data) && String(data) !== '[object File]' ? param(data) : data;
    }];
})
.config(function ($interpolateProvider) {
    $interpolateProvider.startSymbol('{[{').endSymbol('}]}');
});

//TODO: This was a silly idea kc, try again sometime please?
tt.factory('states', function () {
    return {
        "file_list": false,
        "modal": true,
        "ready": false,
        "projects": true,
        "file_text": '',
        "settings": false,
        "content":"",
        "project_crud":false
    }
});

tt.factory('projects', function ($http, $timeout, states) {
    return {
        stats: {},
        every: 2000,
        selected: {},
        last_modified:0,
        all: {},
        fetchAll: function () {
            console.log("fetchAll() called");
            var self = this;
            self.resetStats();
            $http({method: 'GET', url: '/index.php/project/all'})
                .success(function (data) {
                    self.all = data;
                    if (!_.size(self.all)) {
                        states.settings = true;
                    }
                    if (_.isEmpty(self.selected)) {
                        console.log("All Projects: ",self.all);
                        for (var key in self.all){
                            self.selected = self.all[key];
                        }
                        states.ready = true;
                        self.runTests();
                    } else {
                        self.selected = self.all[self.selected.shortname];
                    }
                });
        },
        addTest: function (file) {
            var self = this;
            $http({method: 'POST', data: {'test': file}, url: '/index.php/project/test/' + self.selected.shortname})
                .error(function (data) {
                })
                .success(function (data) {

                });
        },
        deleteTest: function (test) {
            var self = this;
            $http({method: 'DELETE', url: '/index.php/project/test/' + self.selected.shortname + '/' + test._id})
                .error(function(data){

                })
                .success(function (data) {
                    self.fetchAll();
                });
        },
        save: function (name, basepath, ignored_files) {
            var self = this;
            $http({method: 'POST', data: {'name': name, 'basepath': basepath, 'ignored_files': ignored_files}, url: '/index.php/project'})
                .success(function (data) {
                    self.fetchAll();
                });
        },
        testRunner: function (id) {
            var self = this;
            $http({method: 'POST', data: {'file':self.selected.tests[id].path,'project': self.selected }, url: '/index.php/test'})
                .success(function (data) {
                    self.selected.tests[id].state = data.status;
                    self.selected.tests[id].test_count = data.test_count;
                    self.selected.tests[id].assertion_count = data.assertion_count;
                    self.selected.tests[id].last = data;
                    self.stats.tests = self.sum("test_count");
                    self.stats.assertions = self.sum("assertion_count");
                    if(data.status != 'pass'){
                        states.content = data.raw;
                    }
                });
        },
        runTests: function () {
            states.content = '';
            var self = this;
            _.each(self.selected.tests, function (test, idx) {
                if (self.selected.tests[idx].state != 'running') {
                    self.selected.tests[idx].state = 'running';
                    self.testRunner(idx);
                }
            });
        },
        poll: function (epoch_time) {
            var self = this;
            if (_.isUndefined(self.selected)) {
                $timeout(function () {
                    self.poll(self.last_modified);
                }, self.every);
            } else {
                /** only run this if there is a project selected **/
                $http({method: 'GET', url: '/index.php/files/modified/' + epoch_time + '/' + self.selected.shortname})
                    .success(function (data) {
                        self.last_modfied = data.modified;
                        if (data.modified) {
                            self.runTests();
                        }
                        $timeout(function () {
                            self.poll(data.time);
                        }, self.every);
                });
            }
        },
        createProject: function(){
            var self = this;
            self.temp_selected = self.selected;
            self.all['zzzzzzz_last'] = {'shortname':'newproject','name':'Create a New Project'};
            self.selected = self.all['zzzzzzz_last'];
            self.resetStats();
        },
        cancelCreateProject: function(){
            var self = this;
            self.selected = self.temp_selected;
            delete self.all['zzzzzzz_last'];
        },
        sum: function(key){
            var self = this;
            var sum = 0;
            _.each(_.pluck(self.selected.tests, key), function(val){
                if(val != undefined){
                    sum = sum + parseInt(val);
                }
            });
            return sum;
        },
        resetStats: function(){
            this.stats = { tests:0, assertions:0, failures:0 };
        }
    }
});

function headerCtrl($scope, $http, $timeout, states, projects) {
    $scope.states = states;
    $scope.projects = projects;
    $scope.addTest = function () {
        $scope.states.file_list = true;
        $scope.states.projects = false;
    }

    $scope.showOutput = function(test){
        $scope.states.content = _.isEmpty(test.last.raw) ? '' : test.last.raw;
    }
    $scope.delete = function (test) {
        $scope.projects.deleteTest(test);
    };

    $scope.debuginfo = function(){
        //console.log("States:",states);
        //console.log("Projects:", projects);
    }

    //GiddyUp!
    $scope.projects.poll(0);
}

function projectCtrl($scope, $http, states, projects) {
    $scope.projects = [];
    $scope.projects = projects;
    $scope.states = states;

    $scope.createProject = function(){
        $scope.states.project_crud = true;
        $scope.states.content = "";
        $scope.projects.createProject();
    }

    $scope.selectProject = function (project) {
        $scope.projects.resetStats();
        $scope.states.ready = true;
        $scope.projects.selected = project;
        $scope.projects.runTests();
    }

    /** Load automagically if no project is currently set **/
    if (!_.size($scope.projects.all)) {
        $scope.projects.fetchAll();
    }
}

function filesCtrl($scope, $http, states, projects) {
    $scope.states = states;
    $scope.files = [];
    $scope.query = "";
    $scope.projects = projects;

    $scope.search = function () {
        if (_.isEmpty($scope.query)) {
            $scope.files = [];
            $scope.states.file_text = '';
            return true;
        }
        $http({method: 'GET', url: '/index.php/files/' + encodeURIComponent($scope.query.replace('/', '[[..........]]')) + '/' + $scope.projects.selected.shortname})
            .error(function (data) {
                $scope.states.file_text = "Your basepath cannot be found, please update " + $scope.projects.selected.shortname;
            })
            .success(function (data) {
                if (_.isArray(data)) {
                    $scope.files = data;
                    $scope.states.file_text = _.size(data) + ' files matched "' + $scope.query + '"';
                } else {
                    $scope.states.file_text = "There was a problem collecting the list of files. Is the server running?";
                }
            });
    }

    $scope.addTest = function (file) {
        $scope.projects.addTest(file);
        $scope.query = "";
        $scope.states.file_text = "";
        $scope.files = [];
    }

    $scope.cancel = function () {
        $scope.files = [];
        $scope.query = "";
        $scope.states.file_text = "";
        $scope.states.file_list = false;
        $scope.states.projects = true;
    }
}

function projectCrudCtrl($scope, $http, states, projects) {
    $scope.states = states;
    $scope.projects = projects;
    $scope.p_name = "";
    $scope.p_basepath = "";
    $scope.p_ignore_files = ".git, .idea, _.";

    $scope.cancel = function(){
        $scope.states.project_crud = false;
        $scope.projects.cancelCreateProject();
    }

    $scope.save = function () {
        projects.save($scope.p_name, $scope.p_basepath, $scope.p_ignore_files);
        $scope.states.project_crud = false;
        $scope.projects.fetchAll();
    }
}

function footerCtrl($scope, projects){
    $scope.projects = projects;
}
