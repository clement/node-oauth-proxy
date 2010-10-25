exports.views = {
    home: function (req, res, db) {
        res.writeHead(200);
        res.write('<html><head></head><body>');
        db.forEach(function (record) {
                res.write('<p>'+record.hostname+'</p>');
            });
        res.end('</body></html>');
    }
};

