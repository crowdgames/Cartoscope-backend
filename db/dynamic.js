var db = require('../db/db');
var Promise = require('bluebird');
var databaseName = process.env.CARTO_DB_NAME;


//get the gene pool
exports.getGenePool = function(projectId) {
    return new Promise(function(resolve, error) {
        var connection = db.get();
        console.log(projectId);
        connection.queryAsync('SELECT * from task_genetic_sequences where unique_code_main=? and active=0 LIMIT 1', [projectId])
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};

//insert a genetic sequence
exports.insertGeneticSequences = function(gen_info,sequence_list) {
    return new Promise(function(resolve, error) {
        var connection = db.get();

        //prepare data to insert as
        var values = [];
        sequence_list.forEach(function(item){
            values.push([
                gen_info.unique_code_main,
                item,
                gen_info.label_project,
                gen_info.map_project,
                gen_info.marker_project,
                gen_info.progress_type,
                gen_info.active
            ])

        });
        connection.queryAsync('INSERT INTO task_genetic_sequences (unique_code_main,seq,label_project,map_project,marker_project,progress_type,active) VALUES ?', [values])
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};

//insert genetic sequences with independent genetic info objects
exports.insertGeneticSequences2 = function(sequence_list_obj) {
    return new Promise(function(resolve, error) {
        var connection = db.get();

        console.log(sequence_list_obj)

        //prepare data to insert as
        var values = [];
        sequence_list_obj.forEach(function(item){
            values.push([
                item.unique_code_main,
                item.seq,
                item.label_project,
                item.map_project,
                item.marker_project,
                item.progress_type,
                1,
                item.method,
                item.generated_from
            ])
        });
        connection.queryAsync('INSERT INTO task_genetic_sequences (unique_code_main,seq,label_project,map_project,marker_project,progress_type,active,method,generated_from) VALUES ?', [values])
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};

//select top K sequences from current main project
exports.selectTopKsequences = function(main_code,k) {

    return new Promise(function(resolve, error) {
        var connection = db.get();
        connection.queryAsync('SELECT * from task_genetic_sequences where unique_code_main=? and active=1 ' +
            'ORDER BY fitness_function DESC LIMIT ?',
            [main_code,k])
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};

//deactivate all sequences of the main code that do not have an id in the list
exports.deactivateBottomSequences = function(main_code,excluded_items) {

    return new Promise(function(resolve, error) {
        var connection = db.get();

        var id_list = [];
        excluded_items.forEach(function(item){
            id_list.push(item.id.toString())
        });

        connection.queryAsync('update task_genetic_sequences set active=0 where unique_code_main=? and id NOT IN ('+
            id_list.toString() +')',
            [main_code])
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};

//update fitness function based on votes
//fitness function used: avg image count across all users in the condition
//NO restirction on HITID
exports.updateFitnessFunction = function(project) {

    return new Promise(function(resolve, error) {
        var connection = db.get();
        connection.queryAsync('update task_genetic_sequences as tt \
        inner join \
        (select mg.genetic_id, mg.seq, mg.unique_code_main, mg.active, avg(mg.label_count) as avg_label_count \
        from \
        (select sr.user_id, sr.label_count,m.genetic_id,t.seq,t.unique_code_main,t.active \
        from \
        (select r.user_id, count(r.response) as label_count \
        from response as r \
        where project_id=? \
        group by r.user_id) as sr \
        left join mturk_workers as m \
        on m.workerID=sr.user_id \
        left join task_genetic_sequences as t \
        on t.id=m.genetic_id \
        where m.genetic_id IS NOT NULL and m.genetic_id !=0) as mg \
        group by mg.genetic_id) as ss \
        on tt.id=ss.genetic_id \
        set tt.fitness_function=ss.avg_label_count',
            [project.id])
            .then(
                function(data) {
                    resolve(data);
                }, function(err) {
                    error(err);
                });
    });
};

