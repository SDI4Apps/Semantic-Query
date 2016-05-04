var $suggestions = $('<table>').addClass('table conditions').width(300).height(400).hide();
var suggestions_visible = false;
var $table = $('<table>');
var query;
var timer;
var map;

function createUrl(query) {
    return 'http://data.plan4all.eu/sparql?default-graph-uri=&query=' + encodeURIComponent(query) + '&should-sponge=&format=application%2Fsparql-results%2Bjson&timeout=0&debug=on'
}

function createUrlForHtml(query) {
    return 'http://data.plan4all.eu/sparql?default-graph-uri=&query=' + encodeURIComponent(query) + '&should-sponge=&format=text%2Fhtml&timeout=0&debug=on'
}

$(document).ready(function() {
    $('body').append($suggestions);
    $table.addClass('table');
})

$('#run').click(function() {
    var squery = query;
    $.ajax({
        url: createUrlForHtml(query.replace("<extent>", $('#extent').val()))
    }).done(function(r) {
        $("#results").html(r);
        $("#results table").addClass('table table-condensed');
    })
});

$('#show_publish').click(function() {
    var url = 'http://data.plan4all.eu/sparql?default-graph-uri=&query={0}&should-sponge=&format=application%2Fsparql-results%2Bjson&timeout=0&debug=on'.format(encodeURIComponent($('.generated_code').text()));
    url = url.replace('%3Cextent%3E','<extent>');
    $('#resource_locator').html(url);
    $('#publish_dialog').modal('show');
});

function createRow(r, extra_row) {
    var $combo = $('<select>').addClass('form-control property');
    var $operator_dropdown = $('<select>').addClass('form-control');
    $operator_dropdown.addClass('operator').append($('<option>').html('Equals')).append($('<option>').html('Contains'));
    var $condition_input = $('<input>').addClass('form-control condition');
    var $values_btn = $('<button>').addClass('btn btn-default').html('...');
    var $condition_div = $('<div>').addClass('input-group').css('width', '281px').append(
        $condition_input).append($('<span>').addClass('input-group-btn').append($values_btn));
    var $del_btn = $('<button>').addClass('btn btn-danger').html('<span class="glyphicon glyphicon-remove" aria-hidden="true"></span>');
    $del_btn.click(function() {
        $(this).parent().parent().remove();
    });
    $(r.results.bindings).each(function() {
        var r = this;
        $combo.append($('<option>').html(r.p.value));
    })
    var $tr = $('<tr>').addClass('condition_row').append(
            $('<td></td>').append(extra_row ? '<span>AND </span>' : '').append($combo)
        )
        .append(
            $('<td>').append($operator_dropdown)
        ).append(
            $('<td>').append($condition_div)
        ).append(
            $('<td>').append($del_btn)
        )
    $combo.val('http://www.w3.org/2000/01/rdf-schema#label');
    $operator_dropdown.val('Contains');
    $values_btn.click(suggestValues);
    $condition_input.change(generateSparql);
    $combo.change(generateSparql);
    $operator_dropdown.change(generateSparql);
    return $tr;

}

function refresh() {
    $('#loader4suggestions').hide();
    var query = 'SELECT DISTINCT ?p FROM <http://www.sdi4apps.eu/poi.rdf> WHERE {?s ?p ?o} ORDER BY ?p';
    $.ajax({
        url: createUrl(query)
    }).done(function(r) {
        var last_poi = '';
        var last_date = '';
        $table.append($('<tr>')
            .append($('<th>').html('Filter field'))
            .append($('<th>').html('Operator'))
            .append($('<th>').html('Value'))
        );

        $table.append(createRow(r));
        $('#loader4table').hide();
        $('#table_container').html($table);
        $('#table_container').append($('<p>').css('margin', '7px').append(
            $('<button>').addClass('btn btn-primary').html('+').click(function() {
                $table.append(createRow(r, true));
            })))

        $('.condition, .operator, .property').change(function() {
            generateSparql();
        });
    });
}

function suggestValues() {
    var $td = $(this).parent().parent().parent();
    if (suggestions_visible) {
        $suggestions.hide();
        suggestions_visible = false;
    } else {
        $('#loader4suggestions').appendTo($td);
        $('#loader4suggestions').show();
        var property = $(".property option:selected", $(this).parent().parent().parent().parent()).text();
        var query = 'SELECT DISTINCT ?o FROM <http://www.sdi4apps.eu/poi.rdf> WHERE {?s <' + property + '> ?o} LIMIT 20';
        $.ajax({
            url: createUrl(query)
        }).done(function(r) {
            $suggestions.html('');
            $(r.results.bindings).each(function() {
                var r = this;
                $suggestions.append($('<tr>').append(
                    $('<td>').append($('<a href="#">').html(r.o.value).click(
                        function() {
                            $("input", $(this).parent().parent().parent().parent().parent()).val($(this).html())
                            generateSparql();
                            $suggestions.hide();
                            suggestions_visible = false;
                        }))
                ));
                $('#loader4suggestions').hide();
            })
            $suggestions.appendTo($td);
            $suggestions.show();
            suggestions_visible = true;
        })
    }
}

function generateSparql() {
    var conditions = [];
    var criteria_ix = 0;
    $('.condition_row', $table).each(function() {
        var $tr = $(this);
        if ($('.property', $tr).length > 0) {
            var criteria_field = 'c' + (criteria_ix++);
            var val = $('.condition', $tr).val();
            var operator = $('.operator option:selected', $tr).text();
            var property = $('.property option:selected', $tr).text();
            if (operator == 'Equals' && val.indexOf('http') >= 0)
                conditions.push(['?o ', '<' + property + '>', '<' + val + '>'].join(' '));
            if (operator == 'Equals' && val.indexOf('http') == -1)
                conditions.push("?o <" + property + "> ?" + criteria_field + ". FILTER(str(?" + criteria_field + ") = <" + val + ">)");
            if (operator == 'Contains')
                conditions.push("?o <" + property + "> ?" + criteria_field + ". FILTER(regex(str(?" + criteria_field + "), <" + val + ">))");
        }
    })
    var graph = $('#graph').val();
    var geom = $('#geometry').val();
    conditions.push('FILTER(isBlank(?geom) = false)');
    conditions.push('<extent>');
    var sub_query = 'SELECT ?o FROM <' + graph + '> WHERE {?o <' + geom + '> ?geom. ' + conditions.join('. ') + '} LIMIT 100';
    query = 'SELECT ?o ?p ?s FROM <' + graph + '> WHERE { ?o ?p ?s. {' + sub_query + '}}';
    $(".generated_code").text(query);
}

map = new ol.Map({
    target: 'map',
    layers: [
        new ol.layer.Tile({
            source: new ol.source.OSM(),
            title: "OpenStreetMap",
            base: true,
            visible: true,
            removable: false
        })

    ],
    view: new ol.View({
        center: ol.proj.fromLonLat([12.41, 48.82]),
        zoom: 4
    })
});

map.getView().on('change:center', function(e) {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(function() {
        extentChanged(map.getView().calculateExtent(map.getSize()));
    }, 500);
});
map.getView().on('change:resolution', function(e) {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(function() {
        extentChanged(map.getView().calculateExtent(map.getSize()));
    }, 500);
});

function extentChanged(e) {
    var b = ol.proj.transformExtent(e, map.getView().getProjection(), 'EPSG:4326');
    $('#extent').val('FILTER(bif:st_intersects(bif:st_geomfromtext("BOX({0} {1}, {2} {3})"), ?geom)).'.format(b[0], b[1], b[2], b[3]));

}

if (!String.prototype.format) {
    String.prototype.format = function() {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function(match, number) {
            return typeof args[number] != 'undefined' ?
                args[number] :
                match;
        });
    };
}

generateSparql();

refresh();

$('#publish').click(function() {
    //$.cookie("JSESSIONID", "1");

    var contact = {
        name: $('#first_name').val(),
        surname: $('#last_name').val(),
        organization: $('#organization').val(),
        email: $('#email').val(),
        adress: $('#address').val(),
        city: $('#city').val()
    }
    var jobj = {
        title: $('#title').val(),
        token: $.cookie('JSESSIONID'),
        description: $('#description').val(),
        resource_locator: $('#resource_locator').val(),
        keywords: $('#keywords').val(),
        contactPoint: contact,
        lineage: $('#lineage').val(),
        extent: ol.proj.transformExtent(map.getView().calculateExtent(map.getSize()), map.getView().getProjection(), 'EPSG:4326'),
        type: 'service',
        serviceType: 'data',
        issued: (new Date()).toISOString(),
        language: 'en-US',
        publisher: 'guest',
        identifier: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0,
                v = c == 'x' ? r : r & 0x3 | 0x8;
            return v.toString(16);
        }),
        charset: 'utf-8',
        crs: 'EPSG:4326',
        linkage: '',
        format: 'application/sparql-results+json'
    }
    var sjson = JSON.stringify(jobj, null, 2);
/*    $('#json_result').html(sjson);
    $('#publish_json_dialog').modal('show');*/

    $.ajax({
        url: "/php/metadata/util/rest.php",
        data: sjson,
        cache: false,
        method: 'POST',
        async: false,
        dataType: 'json',
        success: function(e){
            $('#publish_dialog').modal('hide');
            $('#publish_result_success').modal('show');
            console.log(e);
        },
        error: function(e){
            $('#publish_dialog').modal('hide');
            $('#publish_result_failure').modal('show');
            console.log(e);

        }
    })
});
