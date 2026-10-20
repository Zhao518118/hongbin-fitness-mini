const docs = require('../../lib/documents');
Page({ data: { title: '', body: '' }, onLoad(query) { const doc = docs[query.type] || docs.terms; this.setData(doc); wx.setNavigationBarTitle({ title: doc.title }); } });
