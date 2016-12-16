/*globals svgEditor:true, globalStorage, widget, svgedit, canvg, jQuery, $, DOMParser, FileReader */
/*jslint vars: true, eqeq: true, todo: true, forin: true, continue: true, regexp: true */
/*
 * svg-editor.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2010 Alexis Deveria
 * Copyright(c) 2010 Pavol Rusnak
 * Copyright(c) 2010 Jeff Schiller
 * Copyright(c) 2010 Narendra Sisodiya
 * Copyright(c) 2014 Brett Zamir
 *
 */

// Dependencies:
// 1) units.js
// 2) browser.js
// 3) svgcanvas.js

/*
TODOS
1. JSDoc
*/
(function() {

	if (window.svgEditor) {
		return;
	}
	window.svgEditor = (function($) {
		var editor = {};
		// EDITOR PROPERTIES: (defined below)
		//		curPrefs, curConfig, canvas, storage, uiStrings
		//
		// STATE MAINTENANCE PROPERTIES
		editor.tool_scale = 1; // Dependent on icon size, so any use to making configurable instead? Used by JQuerySpinBtn.js
		editor.exportWindowCt = 0;
		/*editor.langChanged = false;*/
		editor.showSaveWarning = false;
		editor.storagePromptClosed = false; // For use with ext-storage.js

		var scaleClick = 0;
		var left_gap,right_gap,top_gap,rect_gap,
			bottom_gap = 40;
		var svgCanvas, urldata,
			Utils = svgedit.utilities,
			isReady = false,
			callbacks = [],
			/**
			* PREFS AND CONFIG
			*/
			// The iteration algorithm for defaultPrefs does not currently support array/objects
			defaultPrefs = {
				// EDITOR OPTIONS (DIALOG)
				iconsize: '', // Will default to 's' if the window height is smaller than the minimum height and 'm' otherwise
				bkgd_color: '#FFF',
				bkgd_url: '',
				// DOCUMENT PROPERTIES (DIALOG)
				img_save: 'embed',
				// ALERT NOTICES
				// Only shows in UI as far as alert notices, but useful to remember, so keeping as pref
				save_notice_done: false,
				export_notice_done: false
			},
			curPrefs = {},
			// Note: The difference between Prefs and Config is that Prefs
			//   can be changed in the UI and are stored in the browser,
			//   while config cannot
			curConfig = {
				// We do not put on defaultConfig to simplify object copying
				//   procedures (we obtain instead from defaultExtensions)
				extensions: [],
				/**
				* Can use window.location.origin to indicate the current
				* origin. Can contain a '*' to allow all domains or 'null' (as
				* a string) to support all file:// URLs. Cannot be set by
				* URL for security reasons (not safe, at least for
				* privacy or data integrity of SVG content).
				* Might have been fairly safe to allow
				*   `new URL(window.location.href).origin` by default but
				*   avoiding it ensures some more security that even third
				*   party apps on the same domain also cannot communicate
				*   with this app by default.
				* For use with ext-xdomain-messaging.js
				* @todo We might instead make as a user-facing preference.
				*/
				allowedOrigins: []
			},
			defaultExtensions = [
				'ext-overview_window.js',
				'ext-markers.js',
				'ext-connector.js',
				'ext-compass.js',
				'ext-legend.js',
				'ext-panning.js'
			],
			defaultConfig = {
				// Todo: svgcanvas.js also sets and checks: show_outside_canvas, selectNew; add here?
				// Change the following to preferences and add pref controls to the UI (e.g., initTool, wireframe, showlayers)?
				canvasName: 'default',
				canvas_expansion: 3,
				initFill: {
					color: 'FF0000', // solid red
					opacity: 1
				},
				initStroke: {
					width: 5,
					color: '000000', // solid black
					opacity: 1
				},
				text: {
					stroke_width: 0,
					font_size: 24,
					font_family: 'Microsoft YaHei'
				},
				initOpacity: 1,
				colorPickerCSS: null, // Defaults to 'left' with a position equal to that of the fill_color or stroke_color element minus 140, and a 'bottom' equal to 40
				initTool: 'select',
				exportWindowType: 'new', // 'same' (todo: also support 'download')
				wireframe: false,
				showlayers: false,
				no_save_warning: false,
				// PATH CONFIGURATION
				// The following path configuration items are disallowed in the URL (as should any future path configurations)
				imgPath: 'images/',
				/*langPath: 'locale/',*/
				extPath: 'extensions/',
				jGraduatePath: 'jgraduate/images/',
				// DOCUMENT PROPERTIES
				// Change the following to a preference (already in the Document Properties dialog)?
				dimensions: [640, 480],
				// EDITOR OPTIONS
				// Change the following to preferences (already in the Editor Options dialog)?
				baseUnit: 'cm',
				snappingStep: 10,
				showRulers: true,
				// URL BEHAVIOR CONFIGURATION
				preventAllURLConfig: false,
				preventURLContentLoading: false,
				// EXTENSION CONFIGURATION (see also preventAllURLConfig)
				lockExtensions: false, // Disallowed in URL setting
				noDefaultExtensions: false, // noDefaultExtensions can only be meaningfully used in config.js or in the URL
				// EXTENSION-RELATED (STORAGE)
				noStorageOnLoad: false, // Some interaction with ext-storage.js; prevent even the loading of previously saved local storage
				forceStorage: false, // Some interaction with ext-storage.js; strongly discouraged from modification as it bypasses user privacy by preventing them from choosing whether to keep local storage or not
				emptyStorageOnDecline: false // Used by ext-storage.js; empty any prior storage if the user declines to store
			},
			/**
			* LOCALE
			* @todo Can we remove now that we are always loading even English? (unless locale is set to null)
			*/
			uiStrings = editor.uiStrings = {
				common: {
					ok: '保存',
					cancel: '取消',
					key_up: 'Up',
					key_down: 'Down',
					key_backspace: 'Backspace',
					key_del: 'Del'
				},
				// This is needed if the locale is English, since the locale strings are not read in that instance.
				layers: {
					layer: 'Layer'
				},
				notification: {
					"invalidAttrValGiven":"无效的参数",
					"noContentToFitTo":"无可适应的内容",
					"dupeLayerName":"已存在同名的图层!",
					"enterUniqueLayerName":"请输入一个唯一的图层名称",
					"enterNewLayerName":"请输入新的图层名称",
					"layerHasThatName":"图层已经采用了该名称",
					"QmoveElemsToLayer":"您确定移动所选元素到图层'%s'吗?",
					"QwantToClear":"您希望清除当前绘制的所有图形吗?\n该操作将无法撤消!",
					"QwantToOpen":"您希望打开一个新文档吗?\n该操作将无法撤消!",
					"QerrorsRevertToSource":"SVG文件解析错误.\n是否还原到最初的SVG文件?",
					"QignoreSourceChanges":"忽略对SVG文件所作的更改么?",
					"featNotSupported":"不支持该功能",
					"enterNewImgURL":"请输入新图像的URLL",
					"defsFailOnSave": "注意: 由于您所使用的浏览器存在缺陷, 该图像无法正确显示 (不支持渐变或相关元素). 修复该缺陷后可正确显示.",
					"loadingImage":"正在加载图像, 请稍候...",
					"saveFromBrowser": "选择浏览器中的 \"另存为...\" 将该图像保存为 %s 文件.",
					"noteTheseIssues": "同时注意以下几点: ",
					"unsavedChanges": "存在未保存的修改.",
					"enterNewLinkURL": "输入新建链接的URL地址",
					"errorLoadingSVG": "错误: 无法加载SVG数据",
					"URLloadFail": "无法从URL中加载",
					"retrieving": "检索 \"%s\"...",
					"invalidMapSize":"地图大小超出最大限制！"
				}
			};
		var mapProperties = {//新增，地图属性
			width:0,//图像的原始尺寸（像素）
			height:0,
			
			scale:0,//比例尺
			zoom:1//图像缩放级别
		}
		var mapStyle = {}
		var MAX_SIZE = 10000;
		/*动态改变模板(新添加的函数)*/
		var changeSVGTemple = function(width,height,title){
			if(title){
				document.getElementById("title_name").innerHTML = title;
			}
			if(!width||!height){
				return;
			}
			var image = $("#map_image image")[0];
			image.setAttribute("width",width);
			image.setAttribute("height",height);
			var frameWidth = parseInt(width)+2*(rect_gap+left_gap);
			var frameheight = parseInt(height)+top_gap+bottom_gap+2*rect_gap;
			document.getElementById('background').setAttribute("width",frameWidth);
			document.getElementById('background').setAttribute("height",frameheight);
			document.getElementById("title_name").setAttribute("x",frameWidth/2);
			document.getElementById("map_outside").setAttribute("width",frameWidth-2*left_gap);
			document.getElementById("map_outside").setAttribute("height",frameheight-top_gap-bottom_gap);
			document.getElementById("map_inside").setAttribute("width",frameWidth-2*(left_gap+rect_gap));
			document.getElementById("map_inside").setAttribute("height",frameheight-top_gap-bottom_gap-2*rect_gap);
			document.getElementById("mapping_time").setAttribute("y",frameheight-15);
			document.getElementById("mapping_organization").setAttribute("x",frameWidth-left_gap);
			document.getElementById("mapping_organization").setAttribute("y",frameheight-15);
			var transX = frameWidth-1600,transY = frameheight-1200;
			document.getElementById("northArrow-group").setAttribute("transform","translate("+transX+",0)");
			var legend = $("#legend #legend-group");
			if(legend){
				legend.attr("transform","translate("+(width-mapProperties.width)+","+(height-mapProperties.height)+")");
			}
			var scale = document.getElementById("scale-text");
			if(scale){
				scale.setAttribute("x",frameWidth/2);
				scale.setAttribute("y",frameheight-20);
			}
		};

		var calcMapSize = function(scale){//根据比例尺计算地图尺寸（单位：cm）
			var merc = new SphericalMercator({
				size:256
			});
			var bbox = window.OPTIONS.bbox;
			var ws = merc.forward([bbox[0],bbox[1]]);
			var es = merc.forward([bbox[2],bbox[1]]);
			var wn = merc.forward([bbox[0],bbox[3]]);
			var w = Math.abs(es[0]-ws[0])*100/scale;
			var h = Math.abs(ws[1]-wn[1])*100/scale;
			return {w:w,h:h};
		}
		/**/

		//从xml字符串加载地图模板
		function loadSvgString (str, callback) {
			var success = svgCanvas.setSvgString(str) !== false;
			callback = callback || $.noop;
			if (success) {
				callback(true);
			} else {
				$.alert(uiStrings.notification.errorLoadingSVG, function() {
					callback(false);
				});
			}
		}
		
		/**
		* EXPORTS
		*/
		
		/**
		* Store and retrieve preferences
		* @param {string} key The preference name to be retrieved or set
		* @param {string} [val] The value. If the value supplied is missing or falsey, no change to the preference will be made.
		* @returns {string} If val is missing or falsey, the value of the previously stored preference will be returned.
		* @todo Can we change setting on the jQuery namespace (onto editor) to avoid conflicts?
		* @todo Review whether any remaining existing direct references to
		*	getting curPrefs can be changed to use $.pref() getting to ensure
		*	defaultPrefs fallback (also for sake of allowInitialUserOverride); specifically, bkgd_color could be changed so that
		*	the pref dialog has a button to auto-calculate background, but otherwise uses $.pref() to be able to get default prefs
		*	or overridable settings
		*/
		$.pref = function (key, val) {
			if (val) {
				curPrefs[key] = val;
				editor.curPrefs = curPrefs; // Update exported value
				return;
			}
			return (key in curPrefs) ? curPrefs[key] : defaultPrefs[key];
		};
		
		//每次进入时加载模板
		editor.loadContentAndPrefs = function () {
			var res = $.ajax({url:"./template/map-template.xml",async:false});
			var xml = res.responseText;
			var options = window.OPTIONS;
			if(options){//获取预览地图的url
				var styleurl = options.API.styles+"/"+options.username+"/"+options.style_id+"?access_token="+options.access_token;
				$.get(styleurl,function(style){//请求地图样式
					var layers = style.layers;
					for(var i=0;i<layers.length;i++){
						if(layers[i].paint&&layers[i].paint['raster-fade-duration']){
							layers[i].paint['raster-fade-duration'] = 0;
						}
					}
					mapStyle = JSON.parse(JSON.stringify(style));
					createPrintMap(mapStyle,1,function(blob){
						var objectUrl = window.URL.createObjectURL(blob);
						editor.loadFromString(xml,objectUrl);
					});
				},"json");
			}
			var canvas = document.createElement('canvas');
			var gl = canvas.getContext('experimental-webgl');
			MAX_SIZE = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
		};

		/**
		* Allows setting of preferences or configuration (including extensions).
		* @param {object} opts The preferences or configuration (including extensions)
		* @param {object} [cfgCfg] Describes configuration which applies to the particular batch of supplied options
		* @param {boolean} [cfgCfg.allowInitialUserOverride=false] Set to true if you wish
		*	to allow initial overriding of settings by the user via the URL
		*	(if permitted) or previously stored preferences (if permitted);
		*	note that it will be too late if you make such calls in extension
		*	code because the URL or preference storage settings will
		*   have already taken place.
		* @param {boolean} [cfgCfg.overwrite=true] Set to false if you wish to
		*	prevent the overwriting of prior-set preferences or configuration
		*	(URL settings will always follow this requirement for security
		*	reasons, so config.js settings cannot be overridden unless it
		*	explicitly permits via "allowInitialUserOverride" but extension config
		*	can be overridden as they will run after URL settings). Should
		*   not be needed in config.js.
		*/
		editor.setConfig = function (opts, cfgCfg) {
			cfgCfg = cfgCfg || {};
			function extendOrAdd (cfgObj, key, val) {
				if (cfgObj[key] && typeof cfgObj[key] === 'object') {
					$.extend(true, cfgObj[key], val);
				}
				else {
					cfgObj[key] = val;
				}
				return;
			}
			$.each(opts, function(key, val) {
				if (opts.hasOwnProperty(key)) {
					// Only allow prefs defined in defaultPrefs
					if (defaultPrefs.hasOwnProperty(key)) {
						if (cfgCfg.overwrite === false && (
							curConfig.preventAllURLConfig ||
							curPrefs.hasOwnProperty(key)
						)) {
							return;
						}
						if (cfgCfg.allowInitialUserOverride === true) {
							defaultPrefs[key] = val;
						}
						else {
							$.pref(key, val);
						}
					}
					else if (['extensions', 'allowedOrigins'].indexOf(key) > -1) {
						if (cfgCfg.overwrite === false &&
							(
								curConfig.preventAllURLConfig ||
								key === 'allowedOrigins' ||
								(key === 'extensions' && curConfig.lockExtensions)
							)
						) {
							return;
						}
						curConfig[key] = curConfig[key].concat(val); // We will handle any dupes later
					}
					// Only allow other curConfig if defined in defaultConfig
					else if (defaultConfig.hasOwnProperty(key)) {
						if (cfgCfg.overwrite === false && (
							curConfig.preventAllURLConfig ||
							curConfig.hasOwnProperty(key)
						)) {
							return;
						}
						// Potentially overwriting of previously set config
						if (curConfig.hasOwnProperty(key)) {
							if (cfgCfg.overwrite === false) {
								return;
							}
							extendOrAdd(curConfig, key, val);
						}
						else {
							if (cfgCfg.allowInitialUserOverride === true) {
								extendOrAdd(defaultConfig, key, val);
							}
							else {
								if (defaultConfig[key] && typeof defaultConfig[key] === 'object') {
									curConfig[key] = {};
									$.extend(true, curConfig[key], val); // Merge properties recursively, e.g., on initFill, initStroke objects
								}
								else {
									curConfig[key] = val;
								}
							}
						}
					}
				}
			});
			editor.curConfig = curConfig; // Update exported value
		};

		editor.randomizeIds = function () {
			svgCanvas.randomizeIds(arguments);
		};

		//制图编辑器的初始化
		editor.init = function () {
			// Todo: Avoid var-defined functions and group functions together, etc. where possible
			function setupCurPrefs () {
				curPrefs = $.extend(true, {}, defaultPrefs, curPrefs); // Now safe to merge with priority for curPrefs in the event any are already set
				// Export updated prefs
				editor.curPrefs = curPrefs;
			}
			function setupCurConfig () {
				curConfig = $.extend(true, {}, defaultConfig, curConfig); // Now safe to merge with priority for curConfig in the event any are already set
				
				// Now deal with extensions and other array config
				if (!curConfig.noDefaultExtensions) {
					curConfig.extensions = curConfig.extensions.concat(defaultExtensions);
				}
				// ...and remove any dupes
				$.each(['extensions', 'allowedOrigins'], function (i, cfg) {
					curConfig[cfg] = $.grep(curConfig[cfg], function (n, i) {
						return i === curConfig[cfg].indexOf(n);
					});
				});
				// Export updated config
				editor.curConfig = curConfig;
			}
			(function() {
				// Load config/data from URL if given
				var src, qstr;
				urldata = $.deparam.querystring(true);
				if (!$.isEmptyObject(urldata)) {
					if (urldata.dimensions) {
						urldata.dimensions = urldata.dimensions.split(',');
					}

					if (urldata.bkgd_color) {
						urldata.bkgd_color = '#' + urldata.bkgd_color;
					}
			
					if (urldata.extensions) {
						// For security reasons, disallow cross-domain or cross-folder extensions via URL
						urldata.extensions = urldata.extensions.match(/[:\/\\]/) ? '' : urldata.extensions.split(',');
					}

					// Disallowing extension paths via URL for
					// security reasons, even for same-domain
					// ones given potential to interact in undesirable
					// ways with other script resources
					$.each(
						[
							'extPath', 'imgPath'
						],
						function (pathConfig) {
							if (urldata[pathConfig]) {
								delete urldata[pathConfig];
							}
						}
					);

					editor.setConfig(urldata, {overwrite: false}); // Note: source and url (as with storagePrompt later) are not set on config but are used below
					
					setupCurConfig();

					if (!curConfig.preventURLContentLoading) {
						src = urldata.source;
						qstr = $.param.querystring();
						if (!src) { // urldata.source may have been null if it ended with '='
							if (qstr.indexOf('source=data:') >= 0) {
								src = qstr.match(/source=(data:[^&]*)/)[1];
							}
						}
						if (src) {
							if (src.indexOf('data:') === 0) {
								editor.loadFromDataURI(src);
							} else {
								editor.loadFromString(src);
							}
							return;
						}
						if (urldata.url) {
							editor.loadFromURL(urldata.url);
							return;
						}
					}
					if (!urldata.noStorageOnLoad || curConfig.forceStorage) {
						editor.loadContentAndPrefs();
					}
					setupCurPrefs();
				}
				else {
					setupCurConfig();
					editor.loadContentAndPrefs();
					setupCurPrefs();
				}
			}());
			
			//设置图标
			var setIcon = editor.setIcon = function(elem, icon_id, forcedSize) {
				var icon = (typeof icon_id === 'string') ? $.getSvgIcon(icon_id, true) : icon_id.clone();
				if (!icon) {
					console.log('NOTE: Icon image missing: ' + icon_id);
					return;
				}
				$(elem).empty().append(icon);
			};

			//加载拓展项
			var extFunc = function() {
				$.each(curConfig.extensions, function() {
					var extname = this;
					if (!extname.match(/^ext-.*\.js/)) { // Ensure URL cannot specify some other unintended file in the extPath
						return;
					}
					$.getScript(curConfig.extPath + extname, function(d) {
						// Fails locally in Chrome 5
						if (!d) {
							var s = document.createElement('script');
							s.src = curConfig.extPath + extname;
							document.querySelector('head').appendChild(s);
						}
					});
				});
			};

			// Load extensions
			// Bit of a hack to run extensions in local Opera/IE9
			if (document.location.protocol === 'file:') {
				setTimeout(extFunc, 100);
			} else {
				extFunc();
			}

			//设置图标
			$.svgIcons(curConfig.imgPath + 'svg_edit_icons.svg', {
				w:24, h:24,
				id_match: false,
				no_img: !svgedit.browser.isWebkit(), // Opera & Firefox 4 gives odd behavior w/images
				fallback_path: curConfig.imgPath,
				fallback: {
					'new_image': 'clear.png',
					'save': 'save.png',
					'open': 'open.png',
					'source': 'source.png',
					'docprops': 'document-properties.png',
					'wireframe': 'wireframe.png',

					'undo': 'undo.png',
					'redo': 'redo.png',

					'select': 'select.png',
					'select_node': 'select_node.png',
					'pencil': 'fhpath.png',
					'pen': 'line.png',
					'square': 'square.png',
					'rect': 'rect.png',
					'fh_rect': 'freehand-square.png',
					'circle': 'circle.png',
					'ellipse': 'ellipse.png',
					'fh_ellipse': 'freehand-circle.png',
					'path': 'path.png',
					'text': 'text.png',
					'image': 'image.png',
					'zoom': 'zoom.png',

					'clone': 'clone.png',
					'node_clone': 'node_clone.png',
					'delete': 'delete.png',
					'node_delete': 'node_delete.png',
					'group': 'shape_group_elements.png',
					'ungroup': 'shape_ungroup.png',
					'move_top': 'move_top.png',
					'move_bottom': 'move_bottom.png',
					'to_path': 'to_path.png',
					'link_controls': 'link_controls.png',
					'reorient': 'reorient.png',

					'align_left': 'align-left.png',
					'align_center': 'align-center.png',
					'align_right': 'align-right.png',
					'align_top': 'align-top.png',
					'align_middle': 'align-middle.png',
					'align_bottom': 'align-bottom.png',

					'go_up': 'go-up.png',
					'go_down': 'go-down.png',

					'ok': 'save.png',
					'cancel': 'cancel.png',

					'arrow_right': 'flyouth.png',
					'arrow_down': 'dropdown.gif'
				},
				placement: {
					'#logo': 'logo',
					
					'#tool_clear div,#layer_new': 'new_image',
					'#tool_export div': 'export',
					'#tool_share div': 'share',
					'#tool_open div div': 'open',
					'#tool_import div div': 'import',
					'#tool_source': 'source',
					'#tool_docprops > div': 'docprops',

					'#tool_undo': 'undo',
					'#tool_redo': 'redo',

					'#tool_select': 'select',
					'#tool_fhpath': 'pencil',
					'#tool_line': 'pen',
					'#tool_rect,#tools_rect_show': 'rect',
					'#tool_square': 'square',
					'#tool_fhrect': 'fh_rect',
					'#tool_ellipse,#tools_ellipse_show': 'ellipse',
					'#tool_circle': 'circle',
					'#tool_fhellipse': 'fh_ellipse',
					'#tool_path': 'path',
					'#tool_text,#layer_rename': 'text',
					'#tool_image': 'image',
					'#tool_zoom': 'zoom',

					'#layer_delete,#tool_delete,#tool_delete_multi': 'delete',
					'#tool_group_elements': 'group_elements',
					'#tool_ungroup': 'ungroup',

					'#linecap_butt,#cur_linecap': 'linecap_butt',
					'#linecap_round': 'linecap_round',
					'#linecap_square': 'linecap_square',

					'#linejoin_miter,#cur_linejoin': 'linejoin_miter',
					'#linejoin_round': 'linejoin_round',
					'#linejoin_bevel': 'linejoin_bevel',

					'#url_notice': 'warning',

					'#layer_up': 'go_up',
					'#layer_down': 'go_down',
					'#layer_moreopts': 'context_menu',
					'#layerlist td.layervis': 'eye',

					'#tool_source_save,#tool_docprops_save,#tool_prefs_save': 'ok',
					'#tool_source_cancel,#tool_docprops_cancel,#tool_prefs_cancel': 'cancel',

					'#rwidthLabel, #iwidthLabel': 'width',
					'#rheightLabel, #iheightLabel': 'height',
					'#cornerRadiusLabel span': 'c_radius',
					'#angleLabel': 'angle',
					'#zoomLabel': 'zoom',
					'#tool_fill label': 'fill',
					'#tool_stroke .icon_label': 'stroke',
					'#group_opacityLabel': 'opacity',
					'#blurLabel': 'blur',
					'#font_sizeLabel': 'fontsize',

					'.flyout_arrow_horiz': 'arrow_right',
					'.dropdown button, #main_button .dropdown': 'arrow_down',
					'#palette .palette_item:first, #fill_bg, #stroke_bg': 'no_color'
				},
				resize: {
					'#logo .svg_icon': 28,
					'.flyout_arrow_horiz .svg_icon': 5,
					'.layer_button .svg_icon, #layerlist td.layervis .svg_icon': 14,
					'.dropdown button .svg_icon': 7,
					'#main_button .dropdown .svg_icon': 9,
					'.palette_item:first .svg_icon' : 15,
					'#fill_bg .svg_icon, #stroke_bg .svg_icon': 16,
					'.toolbar_button button .svg_icon': 16,
					'.stroke_tool div div .svg_icon': 20,
					'#tools_bottom label .svg_icon': 18
				},
				callback: function(icons) {
					$('.toolbar_button button > svg, .toolbar_button button > img').each(function() {
						$(this).parent().prepend(this);
					});

					var min_height,
						tleft = $('#tools_left');
					if (tleft.length !== 0) {
						min_height = tleft.offset().top + tleft.outerHeight();
					}
					
					var size = $.pref('iconsize');
					editor.setIconSize(size || ($(window).height() < min_height ? 's': 'm'));

					// Look for any missing flyout icons from plugins
					$('.tools_flyout').each(function() {
						var shower = $('#' + this.id + '_show');
						var sel = shower.attr('data-curopt');
						// Check if there's an icon here
						if (!shower.children('svg, img').length) {
							var clone = $(sel).children().clone();
							if (clone.length) {
								clone[0].removeAttribute('style'); //Needed for Opera
								shower.append(clone);
							}
						}
					});

					editor.runCallbacks();

					setTimeout(function() {
						$('.flyout_arrow_horiz:empty').each(function() {
							$(this).append($.getSvgIcon('arrow_right').width(5).height(5));
						});
					}, 1);
				}
			});

			//初始化svgCanvas
			editor.canvas = svgCanvas = new $.SvgCanvas(document.getElementById('svgcanvas'), curConfig);
			var supportsNonSS, resize_timer, changeZoom, Actions, curScrollPos,
				palette = [ // Todo: Make into configuration item?
					'#000000', '#3f3f3f', '#7f7f7f', '#bfbfbf', '#ffffff',
					'#ff0000', '#ff7f00', '#ffff00', '#7fff00',
					'#00ff00', '#00ff7f', '#00ffff', '#007fff',
					'#0000ff', '#7f00ff', '#ff00ff', '#ff007f',
					'#7f0000', '#7f3f00', '#7f7f00', '#3f7f00',
					'#007f00', '#007f3f', '#007f7f', '#003f7f',
					'#00007f', '#3f007f', '#7f007f', '#7f003f',
					'#ffaaaa', '#ffd4aa', '#ffffaa', '#d4ffaa',
					'#aaffaa', '#aaffd4', '#aaffff', '#aad4ff',
					'#aaaaff', '#d4aaff', '#ffaaff', '#ffaad4'
				],
				modKey = (svgedit.browser.isMac() ? 'meta+' : 'ctrl+'), // ⌘
				path = svgCanvas.pathActions,
				undoMgr = svgCanvas.undoMgr,
				defaultImageURL = curConfig.imgPath + 'logo.png',
				workarea = $('#workarea'),
				canv_menu = $('#cmenu_canvas'),
				// layer_menu = $('#cmenu_layers'), // Unused
				exportWindow = null,
				zoomInIcon = 'crosshair',
				zoomOutIcon = 'crosshair',
				ui_context = 'toolbars',
				origSource = '',
				paintBox = {fill: null, stroke:null};

			// For external openers
			(function() {
				// let the opener know SVG Edit is ready (now that config is set up)
				var svgEditorReadyEvent,
					w = window.opener;
				if (w) {
					try {
						svgEditorReadyEvent = w.document.createEvent('Event');
						svgEditorReadyEvent.initEvent('svgEditorReady', true, true);
						w.document.documentElement.dispatchEvent(svgEditorReadyEvent);
					}
					catch(e) {}
				}
			}());
			
			// This sets up alternative dialog boxes. They mostly work the same way as
			// their UI counterparts, expect instead of returning the result, a callback
			// needs to be included that returns the result as its first parameter.
			// In the future we may want to add additional types of dialog boxes, since
			// they should be easy to handle this way.
			//初始化对话框
			(function() {
				$('#dialog_container').draggable({cancel: '#dialog_content, #dialog_buttons *', containment: 'window'});
				var box = $('#dialog_box'),
					btn_holder = $('#dialog_buttons'),
					dialog_content = $('#dialog_content'),
					dbox = function(type, msg, callback, defaultVal, opts, changeCb, checkbox) {
						var ok, ctrl, chkbx;
						dialog_content.html('<p>'+msg.replace(/\n/g, '</p><p>')+'</p>')
							.toggleClass('prompt', (type == 'prompt'));
						btn_holder.empty();

						ok = $('<input type="button" value="' + uiStrings.common.ok + '">').appendTo(btn_holder);

						if (type !== 'alert') {
							$('<input type="button" value="' + uiStrings.common.cancel + '">')
								.appendTo(btn_holder)
								.click(function() { box.hide(); if (callback) {callback(false);}});
						}

						if (type === 'prompt') {
							ctrl = $('<input type="text">').prependTo(btn_holder);
							ctrl.val(defaultVal || '');
							ctrl.bind('keydown', 'return', function() {ok.click();});
						}
						else if (type === 'select') {
							var div = $('<div style="position: absolute;top: 20px;">');
							ctrl = $('<select style="margin-left: 175px;">').appendTo(div);
							if (checkbox) {
								var label = $('<label>').text(checkbox.label);
								chkbx = $('<input type="checkbox">').appendTo(label);
								chkbx.val(checkbox.value);
								if (checkbox.tooltip) {
									label.attr('title', checkbox.tooltip);
								}
								chkbx.prop('checked', !!checkbox.checked);
								div.append($('<div>').append(label));
							}
							$.each(opts || [], function (opt, val) {
								if (typeof val === 'object') {
									ctrl.append($('<option>').val(val.value).html(val.text));
								}
								else {
									ctrl.append($('<option>').html(val));
								}
							});
							dialog_content.append(div);
							if (defaultVal) {
								ctrl.val(defaultVal);
							}
							if (changeCb) {
								ctrl.bind('change', 'return', changeCb);
							}
							ctrl.bind('keydown', 'return', function() {ok.click();});
						}
						else if (type === 'process') {
							ok.hide();
						}
						$('#dialog_buttons input[type=button]').bind('mouseout',function(e){
							$('#dialog_buttons input[type=button]').removeClass('mouse');
						});
						$('#dialog_buttons input[type=button]').bind('mouseover',function(e){
							$(e.target).addClass('mouse');
						});
						box.show(); 

						ok.click(function() {
							box.hide();
							var resp = (type === 'prompt' || type === 'select') ? ctrl.val() : true;
							if (callback) {
								if (chkbx) {
									callback(resp, chkbx.prop('checked'));
								}
								else {
									callback(resp);
								}
							}
						}).focus();

						if (type === 'prompt' || type === 'select') {
							ctrl.focus();
						}
					};

				$.alert = function(msg, cb) { dbox('alert', msg, cb);};
				$.confirm = function(msg, cb) {	dbox('confirm', msg, cb);};
				$.process_cancel = function(msg, cb) { dbox('process', msg, cb);};
				$.prompt = function(msg, txt, cb) { dbox('prompt', msg, cb, txt);};
				$.select = function(msg, opts, cb, changeCb, txt, checkbox) { dbox('select', msg, cb, txt, opts, changeCb, checkbox);};
			}());

			//svgCanvas设置成“select”模式
			var setSelectMode = function() {
				var curr = $('.tool_button_current');
				if (curr.length && curr[0].id !== 'tool_select') {
					curr.removeClass('tool_button_current').addClass('tool_button');
					$('#tool_select').addClass('tool_button_current').removeClass('tool_button');
					$('#styleoverrides').text('#svgcanvas svg *{cursor:move;pointer-events:all} #svgcanvas svg{cursor:default}');
				}
				svgCanvas.setMode('select');
				workarea.css('cursor', 'auto');
			};

			// used to make the flyouts stay on the screen longer the very first time
			// var flyoutspeed = 1250; // Currently unused
			var textBeingEntered = false;
			var selectedElement = null;
			var multiselected = false;
			var editingsource = false;
			var docprops = false;
			var preferences = false;
			var cur_context = '';
			var origTitle = $('title:first').text();
			// Make [1,2,5] array
			var r_intervals = [];
			var i;
			for (i = 0.1; i < 1E5; i *= 10) {
				r_intervals.push(i);
				r_intervals.push(2 * i);
				r_intervals.push(5 * i);
			}

			// This function highlights the layer passed in (by fading out the other layers)
			// if no layer is passed in, this function restores the other layers
			var toggleHighlightLayer = function(layerNameToHighlight) {
				var i, curNames = [], numLayers = svgCanvas.getCurrentDrawing().getNumLayers();
				for (i = 0; i < numLayers; i++) {
					curNames[i] = svgCanvas.getCurrentDrawing().getLayerName(i);
				}

				if (layerNameToHighlight) {
					for (i = 0; i < numLayers; ++i) {
						if (curNames[i] != layerNameToHighlight) {
							svgCanvas.getCurrentDrawing().setLayerOpacity(curNames[i], 0.5);
						}
					}
				} else {
					for (i = 0; i < numLayers; ++i) {
						svgCanvas.getCurrentDrawing().setLayerOpacity(curNames[i], 1.0);
					}
				}
			};

			var populateLayers = function() {
				svgCanvas.clearSelection();
				var layerlist = $('#layerlist tbody').empty();
				var selLayerNames = $('#selLayerNames').empty();
				var drawing = svgCanvas.getCurrentDrawing();
				var currentLayerName = drawing.getCurrentLayerName();
				var layer = svgCanvas.getCurrentDrawing().getNumLayers();
				var icon = $.getSvgIcon('eye');
				// we get the layers in the reverse z-order (the layer rendered on top is listed first)
				while (layer--) {
					var name = drawing.getLayerName(layer);
					var layerTr = $('<tr class="layer">').toggleClass('layersel', name === currentLayerName);
					var layerVis = $('<td class="layervis">').toggleClass('layerinvis', !drawing.getLayerVisibility(name));
					var layerName = $('<td class="layername">' + name + '</td>');
					layerlist.append(layerTr.append(layerVis, layerName));
					selLayerNames.append('<option value="' + name + '">' + name + '</option>');
				}
				if (icon !== undefined) {
					var copy = icon.clone();
					$('td.layervis', layerlist).append(copy);
					$.resizeSvgIcons({'td.layervis .svg_icon': 14});
				}
				// handle selection of layer
				$('#layerlist td.layername')
					.mouseup(function(evt) {
						$('#layerlist tr.layer').removeClass('layersel');
						$(this.parentNode).addClass('layersel');
						svgCanvas.setCurrentLayer(this.textContent);
						evt.preventDefault();
					})
					.mouseover(function() {
						toggleHighlightLayer(this.textContent);
					})
					.mouseout(function() {
						toggleHighlightLayer();
					});
				$('#layerlist td.layervis').click(function() {
					var row = $(this.parentNode).prevAll().length;
					var name = $('#layerlist tr.layer:eq(' + row + ') td.layername').text();
					var vis = $(this).hasClass('layerinvis');
					svgCanvas.setLayerVisibility(name, vis);
					$(this).toggleClass('layerinvis');
				});

				// if there were too few rows, let's add a few to make it not so lonely
				var num = 5 - $('#layerlist tr.layer').size();
				while (num-- > 0) {
					// FIXME: there must a better way to do this
					layerlist.append('<tr><td style="color:white">_</td><td/></tr>');
				}
			};

			//显示svg源代码
			var showSourceEditor = function(e, forSaving) {
				if (editingsource) {return;}
				$('#tool_source_save').bind('mouseout',function(e){
					$('#tool_source_save').removeClass('mouse');
				});
				$('#tool_source_save').bind('mouseover',function(e){
					$(e.target).addClass('mouse');
				});
				$('#tool_source_cancel').bind('mouseout',function(e){
					$('#tool_source_cancel').removeClass('mouse');
				});
				$('#tool_source_cancel').bind('mouseover',function(e){
					$(e.target).addClass('mouse');
				});
				editingsource = true;
				origSource = svgCanvas.getSvgString();
				/*$('#save_output_btns').toggle(!!forSaving);*/
				$('#tool_source_back').toggle(!forSaving);
				$('#svg_source_textarea').val(origSource);
				$('#svg_source_editor').fadeIn();
				$('#svg_source_textarea').focus();
			};

			var operaRepaint = function() {
				// Repaints canvas in Opera. Needed for stroke-dasharray change as well as fill change
				if (!window.opera) {
					return;
				}
				$('<p/>').hide().appendTo('body').remove();
			};

			function setStrokeOpt(opt, changeElem) {
				var id = opt.id;
				var bits = id.split('_');
				var pre = bits[0];
				var val = bits[1];

				if (changeElem) {
					svgCanvas.setStrokeAttr('stroke-' + pre, val);
				}
				operaRepaint();
				setIcon('#cur_' + pre, id, 20);
				$(opt).addClass('current').siblings().removeClass('current');
			}

			// This is a common function used when a tool has been clicked (chosen)
			// It does several common things:
			// - removes the tool_button_current class from whatever tool currently has it
			// - hides any flyouts
			// - adds the tool_button_current class to the button passed in
			var toolButtonClick = editor.toolButtonClick = function(button, noHiding) {
				if ($(button).hasClass('disabled')) {return false;}
				if ($(button).parent().hasClass('tools_flyout')) {return true;}
				var fadeFlyouts = 'normal';
				if (!noHiding) {
					/*$('.tools_flyout').fadeOut(fadeFlyouts);*/
				}
				$('#styleoverrides').text('');
				workarea.css('cursor', 'auto');
				$('.tool_button_current').removeClass('tool_button_current').addClass('tool_button');
				$(button).addClass('tool_button_current').removeClass('tool_button');
				return true;
			};

			var clickSelect = editor.clickSelect = function() {
				if (toolButtonClick('#tool_select')) {
					svgCanvas.setMode('select');
					$('#styleoverrides').text('#svgcanvas svg *{cursor:move;pointer-events:all}, #svgcanvas svg{cursor:default}');
				}
			};

			function setBackground (color, url) {
				$.pref('bkgd_color', color);
				$.pref('bkgd_url', url);

				// This should be done in svgcanvas.js for the borderRect fill
				svgCanvas.setBackground(color, url);
			}

			var setInputWidth = function(elem) {
				var w = Math.min(Math.max(12 + elem.value.length * 6, 50), 300);
				$(elem).width(w);
			};

			function updateRulers(scanvas, zoom) {
				if (!zoom) {zoom = svgCanvas.getZoom();}
				if (!scanvas) {scanvas = $('#svgcanvas');}

				var d, i;
				var limit = 30000;
				var contentElem = svgCanvas.getContentElem();
				var units = svgedit.units.getTypeMap();
				var unit = units[curConfig.baseUnit]; // 1 = 1px

				// draw x ruler then y ruler
				for (d = 0; d < 2; d++) {
					var isX = (d === 0);
					var dim = isX ? 'x' : 'y';
					var lentype = isX ? 'width' : 'height';
					var contentDim = Number(contentElem.getAttribute(dim));

					var $hcanv_orig = $('#ruler_' + dim + ' canvas:first');

					// Bit of a hack to fully clear the canvas in Safari & IE9
					var $hcanv = $hcanv_orig.clone();
					$hcanv_orig.replaceWith($hcanv);

					var hcanv = $hcanv[0];

					// Set the canvas size to the width of the container
					var ruler_len = scanvas[lentype]();
					var total_len = ruler_len;
					hcanv.parentNode.style[lentype] = total_len + 'px';
					var ctx_num = 0;
					var ctx = hcanv.getContext('2d');
					var ctx_arr, num, ctx_arr_num;

					ctx.fillStyle = 'rgb(200,0,0)';
					ctx.fillRect(0, 0, hcanv.width, hcanv.height);

					// Remove any existing canvasses
					$hcanv.siblings().remove();
					
					// Create multiple canvases when necessary (due to browser limits)
					if (ruler_len >= limit) {
						ctx_arr_num = parseInt(ruler_len / limit, 10) + 1;
						ctx_arr = [];
						ctx_arr[0] = ctx;
						var copy;
						for (i = 1; i < ctx_arr_num; i++) {
							hcanv[lentype] = limit;
							copy = hcanv.cloneNode(true);
							hcanv.parentNode.appendChild(copy);
							ctx_arr[i] = copy.getContext('2d');
						}

						copy[lentype] = ruler_len % limit;

						// set copy width to last
						ruler_len = limit;
					}

					hcanv[lentype] = ruler_len;

					var u_multi = unit * zoom;

					// Calculate the main number interval
					var raw_m = 50 / u_multi;
					var multi = 1;
					for (i = 0; i < r_intervals.length; i++) {
						num = r_intervals[i];
						multi = num;
						if (raw_m <= num) {
							break;
						}
					}

					var big_int = multi * u_multi;

					ctx.font = '9px sans-serif';

					var ruler_d = ((contentDim / u_multi) % multi) * u_multi;
					var label_pos = ruler_d - big_int;
					// draw big intervals
					while (ruler_d < total_len) {
						label_pos += big_int;
						// var real_d = ruler_d - contentDim; // Currently unused

						var cur_d = Math.round(ruler_d) + 0.5;
						if (isX) {
							ctx.moveTo(cur_d, 15);
							ctx.lineTo(cur_d, 0);
						}
						else {
							ctx.moveTo(15, cur_d);
							ctx.lineTo(0, cur_d);
						}

						num = (label_pos - contentDim) / u_multi;
						var label;
						if (multi >= 1) {
							label = Math.round(num);
						}
						else {
							var decs = String(multi).split('.')[1].length;
							label = num.toFixed(decs);
						}

						// Change 1000s to Ks
						if (label !== 0 && label !== 1000 && label % 1000 === 0) {
							label = (label / 1000) + 'K';
						}

						if (isX) {
							ctx.fillText(label, ruler_d+2, 8);
						} else {
							// draw label vertically
							var str = String(label).split('');
							for (i = 0; i < str.length; i++) {
								ctx.fillText(str[i], 1, (ruler_d+9) + i*9);
							}
						}

						var part = big_int / 10;
						// draw the small intervals
						for (i = 1; i < 10; i++) {
							var sub_d = Math.round(ruler_d + part * i) + 0.5;
							if (ctx_arr && sub_d > ruler_len) {
								ctx_num++;
								ctx.stroke();
								if (ctx_num >= ctx_arr_num) {
									i = 10;
									ruler_d = total_len;
									continue;
								}
								ctx = ctx_arr[ctx_num];
								ruler_d -= limit;
								sub_d = Math.round(ruler_d + part * i) + 0.5;
							}

							// odd lines are slighly longer
							var line_num = (i % 2) ? 12 : 10;
							if (isX) {
								ctx.moveTo(sub_d, 15);
								ctx.lineTo(sub_d, line_num);
							} else {
								ctx.moveTo(15, sub_d);
								ctx.lineTo(line_num, sub_d);
							}
						}
						ruler_d += big_int;
					}
					ctx.strokeStyle = '#000';
					ctx.stroke();
				}
			}

			var updateCanvas = editor.updateCanvas = function(center, new_ctr) {
				var w = workarea.width(), h = workarea.height();
				var w_orig = w, h_orig = h;
				var zoom = svgCanvas.getZoom();
				var w_area = workarea;
				var cnvs = $('#svgcanvas');
				var old_ctr = {
					x: w_area[0].scrollLeft + w_orig/2,
					y: w_area[0].scrollTop + h_orig/2
				};
				var multi = curConfig.canvas_expansion;
				w = Math.max(w_orig, svgCanvas.contentW * zoom * multi);
				h = Math.max(h_orig, svgCanvas.contentH * zoom * multi);

				if (w == w_orig && h == h_orig) {
					workarea.css('overflow', 'hidden');
				} else {
					workarea.css('overflow', 'scroll');
				}

				var old_can_y = cnvs.height()/2;
				var old_can_x = cnvs.width()/2;
				cnvs.width(w).height(h);
				var new_can_y = h/2;
				var new_can_x = w/2;
				var offset = svgCanvas.updateCanvas(w, h);

				var ratio = new_can_x / old_can_x;

				var scroll_x = w/2 - w_orig/2;
				var scroll_y = h/2 - h_orig/2;

				if (!new_ctr) {
					var old_dist_x = old_ctr.x - old_can_x;
					var new_x = new_can_x + old_dist_x * ratio;

					var old_dist_y = old_ctr.y - old_can_y;
					var new_y = new_can_y + old_dist_y * ratio;

					new_ctr = {
						x: new_x,
						y: new_y
					};
				} else {
					new_ctr.x += offset.x;
					new_ctr.y += offset.y;
				}

				if (center) {
					// Go to top-left for larger documents
					if (svgCanvas.contentW > w_area.width()) {
						// Top-left
						workarea[0].scrollLeft = offset.x - 10;
						workarea[0].scrollTop = offset.y - 10;
					} else {
						// Center
						w_area[0].scrollLeft = scroll_x;
						w_area[0].scrollTop = scroll_y;
					}
				} else {
					w_area[0].scrollLeft = new_ctr.x - w_orig/2;
					w_area[0].scrollTop = new_ctr.y - h_orig/2;
				}
				if (curConfig.showRulers) {
					updateRulers(cnvs, zoom);
					workarea.scroll();
				}
				if (urldata.storagePrompt !== true && !editor.storagePromptClosed) {
					$('#dialog_box').hide();
				}
			};

			var updateToolButtonState = function() {
				var index, button;
				var bNoFill = (svgCanvas.getColor('fill') == 'none');
				var bNoStroke = (svgCanvas.getColor('stroke') == 'none');
				var buttonsNeedingStroke = [ '#tool_fhpath', '#tool_line' ];
				var buttonsNeedingFillAndStroke = [ '#tools_rect .tool_button', '#tools_ellipse .tool_button', '#tool_text', '#tool_path'];
				if (bNoStroke) {
					for (index in buttonsNeedingStroke) {
						button = buttonsNeedingStroke[index];
						if ($(button).hasClass('tool_button_current')) {
							clickSelect();
						}
						$(button).addClass('disabled');
					}
				} else {
					for (index in buttonsNeedingStroke) {
						button = buttonsNeedingStroke[index];
						$(button).removeClass('disabled');
					}
				}

				if (bNoStroke && bNoFill) {
					for (index in buttonsNeedingFillAndStroke) {
						button = buttonsNeedingFillAndStroke[index];
						if ($(button).hasClass('tool_button_current')) {
							clickSelect();
						}
						$(button).addClass('disabled');
					}
				} else {
					for (index in buttonsNeedingFillAndStroke) {
						button = buttonsNeedingFillAndStroke[index];
						$(button).removeClass('disabled');
					}
				}

				svgCanvas.runExtensions('toolButtonStateUpdate', {
					nofill: bNoFill,
					nostroke: bNoStroke
				});

				// Disable flyouts if all inside are disabled
				$('.tools_flyout').each(function() {
					var shower = $('#' + this.id + '_show');
					var has_enabled = false;
					$(this).children().each(function() {
						if (!$(this).hasClass('disabled')) {
							has_enabled = true;
						}
					});
					shower.toggleClass('disabled', !has_enabled);
				});

				operaRepaint();
			};

			// Updates the toolbar (colors, opacity, etc) based on the selected element
			// This function also updates the opacity and id elements that are in the context panel
			var updateToolbar = function() {
				var i, len;
				if (selectedElement != null) {
					switch (selectedElement.tagName) {
					case 'use':
					case 'image':
					case 'foreignObject':
						break;
					case 'g':
					case 'a':
						// Look for common styles
						var gWidth = null;
						var childs = selectedElement.getElementsByTagName('*');
						for (i = 0, len = childs.length; i < len; i++) {
							var swidth = childs[i].getAttribute('stroke-width');

							if (i === 0) {
								gWidth = swidth;
							} else if (gWidth !== swidth) {
								gWidth = null;
							}
						}

						$('#stroke_width').val(gWidth === null ? '' : gWidth);

						paintBox.fill.update(true);
						paintBox.stroke.update(true);

						break;
					default:
						paintBox.fill.update(true);
						paintBox.stroke.update(true);

						$('#stroke_width').val(selectedElement.getAttribute('stroke-width') || 1);
						$('#stroke_style').val(selectedElement.getAttribute('stroke-dasharray') || 'none');

						var attr = selectedElement.getAttribute('stroke-linejoin') || 'miter';

						if ($('#linejoin_' + attr).length != 0) {
							setStrokeOpt($('#linejoin_' + attr)[0]);
						}

						attr = selectedElement.getAttribute('stroke-linecap') || 'butt';

						if ($('#linecap_' + attr).length != 0) {
							setStrokeOpt($('#linecap_' + attr)[0]);
						}
					}
				}

				// All elements including image and group have opacity
				if (selectedElement != null) {
					var opac_perc = ((selectedElement.getAttribute('opacity')||1.0)*100);
					$('#group_opacity').val(opac_perc);
					$('#opac_slider').slider('option', 'value', opac_perc);
					$('#elem_id').val(selectedElement.id);
					$('#elem_class').val(selectedElement.getAttribute("class"));
				}

				updateToolButtonState();
			};

			// updates the context panel tools based on the selected element
			var updateContextPanel = function() {
				var elem = selectedElement;
				// If element has just been deleted, consider it null
				if (elem != null && !elem.parentNode) {elem = null;}
				var currentLayerName = svgCanvas.getCurrentDrawing().getCurrentLayerName();
				var currentMode = svgCanvas.getMode();
				var unit = curConfig.baseUnit !== 'px' ? curConfig.baseUnit : null;

				var is_node = currentMode == 'pathedit'; //elem ? (elem.id && elem.id.indexOf('pathpointgrip') == 0) : false;
				var menu_items = $('#cmenu_canvas li');
				$('#multiselected_panel, #g_panel,#circle_panel,#ellipse_panel, #line_panel, #text_panel').hide();
				if (elem != null) {
					var elname = elem.nodeName;
					// If this is a link with no transform and one child, pretend
					// its child is selected

					var angle = svgCanvas.getRotationAngle(elem);
					$('#angle').val(angle);

					var blurval = svgCanvas.getBlur(elem);
					$('#blur').val(blurval);
					$('#blur_slider').slider('option', 'value', blurval);
					// update contextual tools here
					var panels = {
						g: [],
						a: [],
						rect: ['rx', 'width', 'height'],
						image: ['width', 'height'],
						circle: ['cx', 'cy', 'r'],
						ellipse: ['cx', 'cy', 'rx', 'ry'],
						line: ['x1', 'y1', 'x2', 'y2'],
						text: [],
						use: []
					};

					var el_name = elem.tagName;

					var link_href = null;
					if (el_name === 'a') {
						link_href = svgCanvas.getHref(elem);
						$('#g_panel').show();
					}

					if (elem.parentNode.tagName === 'a') {
						if (!$(elem).siblings().length) {
							$('#a_panel').show();
							link_href = svgCanvas.getHref(elem.parentNode);
						}
					}

					if (panels[el_name]) {
						var cur_panel = panels[el_name];

						$('#' + el_name + '_panel').show();

						$.each(cur_panel, function(i, item) {
							var attrVal = elem.getAttribute(item);
							if (curConfig.baseUnit !== 'px' && elem[item]) {
								var bv = elem[item].baseVal.value;
								attrVal = svgedit.units.convertUnit(bv);
							}
							$('#' + el_name + '_' + item).val(attrVal || 0);
						});

						if (el_name == 'text') {
							$('#text_panel').css('display', 'inline');
							$('#tool_font_size').css('display', 'inline');
							if (svgCanvas.getItalic()) {
								$('#tool_italic').addClass('push_button_pressed').removeClass('tool_button');
							} else {
								$('#tool_italic').removeClass('push_button_pressed').addClass('tool_button');
							}
							if (svgCanvas.getBold()) {
								$('#tool_bold').addClass('push_button_pressed').removeClass('tool_button');
							} else {
								$('#tool_bold').removeClass('push_button_pressed').addClass('tool_button');
							}
							$('#font_family').val(font_English2Chinese(elem.getAttribute('font-family')));
							$('#font_size').val(elem.getAttribute('font-size'));
							$('#text').val(elem.textContent);
							if (svgCanvas.addedNew) {
								// Timeout needed for IE9
								setTimeout(function() {
									$('#text').focus().select();
								}, 100);
							}
						} // text
					}
					menu_items[(el_name === 'g' ? 'en' : 'dis') + 'ableContextMenuItems']('#ungroup');
					menu_items[((el_name === 'g' || !multiselected) ? 'dis' : 'en') + 'ableContextMenuItems']('#group');
				} // if (elem != null)
				else if (multiselected) {
					$('#multiselected_panel').show();
					menu_items
						.enableContextMenuItems('#group')
						.disableContextMenuItems('#ungroup');
				} else {
					menu_items.disableContextMenuItems('#delete,#cut,#copy,#group,#ungroup,#move_front,#move_up,#move_down,#move_back');
				}

				// update history buttons
				$('#tool_undo').toggleClass('disabled', undoMgr.getUndoStackSize() === 0);
				$('#tool_redo').toggleClass('disabled', undoMgr.getRedoStackSize() === 0);

				svgCanvas.addedNew = false;

				if ( (elem && !is_node)	|| multiselected) {
					// update the selected elements' layer
					$('#selLayerNames').removeAttr('disabled').val(currentLayerName);

					// Enable regular menu options
					canv_menu.enableContextMenuItems('#delete,#cut,#copy,#move_front,#move_up,#move_down,#move_back');
				} else {
					$('#selLayerNames').attr('disabled', 'disabled');
				}
			};

			var updateWireFrame = function() {
				// Test support
				if (supportsNonSS) {return;}

				var rule = '#workarea.wireframe #svgcontent * { stroke-width: ' + 1/svgCanvas.getZoom() + 'px; }';
				$('#wireframe_rules').text(workarea.hasClass('wireframe') ? rule : '');
			};

			var updateTitle = function(title) {
				title = title || svgCanvas.getDocumentTitle();
				var newTitle = origTitle + (title ? ': ' + title : '');

				// Remove title update with current context info, isn't really necessary
				$('title:first').text(newTitle);
			};

			// called when we've selected a different element
			var selectedChanged = function(win, elems) {
				var mode = svgCanvas.getMode();
				if (mode === 'select') {
					setSelectMode();
				}
				var is_node = (mode == "pathedit");
				// if elems[1] is present, then we have more than one element
				selectedElement = (elems.length === 1 || elems[1] == null ? elems[0] : null);
				multiselected = (elems.length >= 2 && elems[1] != null);
				if (selectedElement != null) {
					// unless we're already in always set the mode of the editor to select because
					// upon creation of a text element the editor is switched into
					// select mode and this event fires - we need our UI to be in sync

					if (!is_node) {
						updateToolbar();
					}
				} // if (elem != null)

				// Deal with pathedit mode
				//togglePathEditMode(is_node, elems);
				updateContextPanel();
				svgCanvas.runExtensions('selectedChanged', {
					elems: elems,
					selectedElement: selectedElement,
					multiselected: multiselected
				});
			};

			// Call when part of element is in process of changing, generally
			// on mousemove actions like rotate, move, etc.
			var elementTransition = function(win, elems) {
				var mode = svgCanvas.getMode();
				var elem = elems[0];

				if (!elem) {
					return;
				}

				multiselected = (elems.length >= 2 && elems[1] != null);
				// Only updating fields for single elements for now
				if (!multiselected) {
					switch (mode) {
						case 'rotate':
							var ang = svgCanvas.getRotationAngle(elem);
							$('#angle').val(ang);
							$('#tool_reorient').toggleClass('disabled', ang === 0);
							break;

						// TODO: Update values that change on move/resize, etc
					}
				}
				svgCanvas.runExtensions('elementTransition', {
					elems: elems
				});
			};

			/**
			 * Test whether an element is a layer or not.
			 * @param {SVGGElement} elem - The SVGGElement to test.
			 * @returns {boolean} True if the element is a layer
			 */
			function isLayer(elem) {
				return elem && elem.tagName === 'g' && svgedit.draw.Layer.CLASS_REGEX.test(elem.getAttribute('class'))
			}

			// called when any element has changed
			var elementChanged = function(win, elems) {
				var i,
					mode = svgCanvas.getMode();
				if (mode === 'select') {
					setSelectMode();
				}

				for (i = 0; i < elems.length; ++i) {
					var elem = elems[i];

					var isSvgElem = (elem && elem.tagName === 'svg');
					if (isSvgElem || isLayer(elem)) {
						populateLayers();
						// if the element changed was the svg, then it could be a resolution change
						if (isSvgElem) {
							updateCanvas();
						}
					}
					// Update selectedElement if element is no longer part of the image.
					// This occurs for the text elements in Firefox
					else if (elem && selectedElement && selectedElement.parentNode == null) {
						selectedElement = elem;
					}
				}

				editor.showSaveWarning = true;

				// we update the contextual panel with potentially new
				// positional/sizing information (we DON'T want to update the
				// toolbar here as that creates an infinite loop)
				// also this updates the history buttons

				// we tell it to skip focusing the text control if the
				// text element was previously in focus
				updateContextPanel();

				// In the event a gradient was flipped:
				if (selectedElement && mode === 'select') {
					paintBox.fill.update();
					paintBox.stroke.update();
				}

				svgCanvas.runExtensions('elementChanged', {
					elems: elems
				});
			};

			var zoomDone = function() {
				updateWireFrame();
				// updateCanvas(); // necessary?
			};

			var zoomChanged = svgCanvas.zoomChanged = function(win, bbox, autoCenter) {
				var scrbar = 15,w_area = workarea;
				var z_info = svgCanvas.setBBoxZoom(bbox, w_area.width()-scrbar, w_area.height()-scrbar);
				if (!z_info) {return;}
				var zoomlevel = z_info.zoom,
					bb = z_info.bbox;

				if (zoomlevel < 0.001) {
					changeZoom({value: 0.1});
					return;
				}

				$('#zoom').val((zoomlevel*100).toFixed(1));

				if (autoCenter) {
					updateCanvas();
				} else {
					updateCanvas(false, {x: bb.x * zoomlevel + (bb.width * zoomlevel)/2, y: bb.y * zoomlevel + (bb.height * zoomlevel)/2});
				}

				if (svgCanvas.getMode() == 'zoom' && bb.width) {
					// Go to select if a zoom box was drawn
					setSelectMode();
				}

				zoomDone();
			};

			changeZoom = function(ctl) {
				var zoomlevel = ctl.value / 100;
				if (zoomlevel < 0.001) {
					ctl.value = 0.1;
					return;
				}
				var zoom = svgCanvas.getZoom();
				var w_area = workarea;

				zoomChanged(window, {
					width: 0,
					height: 0,
					// center pt of scroll position
					x: (w_area[0].scrollLeft + w_area.width()/2)/zoom,
					y: (w_area[0].scrollTop + w_area.height()/2)/zoom,
					zoom: zoomlevel
				}, true);
			};

			$('#cur_context_panel').delegate('a', 'click', function() {
				var link = $(this);
				if (link.attr('data-root')) {
					svgCanvas.leaveContext();
				} else {
					svgCanvas.setContext(link.text());
				}
				svgCanvas.clearSelection();
				return false;
			});

			var contextChanged = function(win, context) {
				var link_str = '';
				if (context) {
					var str = '';
					link_str = '<a href="#" data-root="y">' + svgCanvas.getCurrentDrawing().getCurrentLayerName() + '</a>';

					$(context).parentsUntil('#svgcontent > g').andSelf().each(function() {
						if (this.id) {
							str += ' > ' + this.id;
							if (this !== context) {
								link_str += ' > <a href="#">' + this.id + '</a>';
							} else {
								link_str += ' > ' + this.id;
							}
						}
					});

					cur_context = str;
				} else {
					cur_context = null;
				}
				$('#cur_context_panel').toggle(!!context).html(link_str);

				updateTitle();
			};

			// Makes sure the current selected paint is available to work with
			var prepPaints = function() {
				paintBox.fill.prep();
				paintBox.stroke.prep();
			};

			var flyout_funcs = {};

			var setFlyoutTitles = function() {
				$('.tools_flyout').each(function() {
					var shower = $('#' + this.id + '_show');
					if (shower.data('isLibrary')) {
						return;
					}

					var tooltips = [];
					$(this).children().each(function() {
						tooltips.push(this.title);
					});
					shower[0].title = tooltips.join(' / ');
				});
			};

			var setFlyoutPositions = function() {
				$('.tools_flyout').each(function() {
					var shower = $('#' + this.id + '_show');
					var pos = shower.offset();
					var w = shower.outerWidth();
					$(this).css({left: (pos.left + w) * editor.tool_scale, top: pos.top});
				});
			};

			var setupFlyouts = function(holders) {
				$.each(holders, function(hold_sel, btn_opts) {
					var buttons = $(hold_sel).children();
					var show_sel = hold_sel + '_show';
					var shower = $(show_sel);
					var def = false;
					buttons.addClass('tool_button')
						.unbind('click mousedown mouseup') // may not be necessary
						.each(function(i) {
							// Get this buttons options
							var opts = btn_opts[i];

							// Remember the function that goes with this ID
							flyout_funcs[opts.sel] = opts.fn;

							if (opts.isDefault) {def = i;}

							// Clicking the icon in flyout should set this set's icon
							var func = function(event) {
								var options = opts;
								//find the currently selected tool if comes from keystroke
								if (event.type === 'keydown') {
									var flyoutIsSelected = $(options.parent + '_show').hasClass('tool_button_current');
									var currentOperation = $(options.parent + '_show').attr('data-curopt');
									$.each(holders[opts.parent], function(i, tool) {
										if (tool.sel == currentOperation) {
											if (!event.shiftKey || !flyoutIsSelected) {
												options = tool;
											} else {
												options = holders[opts.parent][i+1] || holders[opts.parent][0];
											}
										}
									});
								}
								if ($(this).hasClass('disabled')) {return false;}
								if (toolButtonClick(show_sel)) {
									options.fn();
								}
								var icon;
								if (options.icon) {
									icon = $.getSvgIcon(options.icon, true);
								} else {
									icon = $(options.sel).children().eq(0).clone();
								}

								icon[0].setAttribute('width', shower.width());
								icon[0].setAttribute('height', shower.height());
								shower.children(':not(.flyout_arrow_horiz)').remove();
								shower.append(icon).attr('data-curopt', options.sel); // This sets the current mode
							};

							$(this).mouseup(func);

							if (opts.key) {
								$(document).bind('keydown', opts.key[0] + ' shift+' + opts.key[0], func);
							}
						});

					if (def) {
						shower.attr('data-curopt', btn_opts[def].sel);
					} else if (!shower.attr('data-curopt')) {
						// Set first as default
						shower.attr('data-curopt', btn_opts[0].sel);
					}

					var timer;
					var pos = $(show_sel).position();

					// Clicking the "show" icon should set the current mode
					shower.mousedown(function(evt) {
						if (shower.hasClass('disabled')) {
							return false;
						}
						var holder = $(hold_sel);
						var l = pos.left + 34;
						var w = holder.width() * -1;
						var time = holder.data('shown_popop') ? 200 : 0;
						timer = setTimeout(function() {
							// Show corresponding menu
							if (!shower.data('isLibrary')) {
								holder.css('left', w).show().animate({
									left: l
								}, 150);
							} else {
								holder.css('left', l).show();
							}
						},time);
						evt.preventDefault();
					}).mouseup(function(evt) {
						clearTimeout(timer);
						var opt = $(this).attr('data-curopt');
						// Is library and popped up, so do nothing
						if (shower.data('isLibrary') && $(show_sel.replace('_show', '')).is(':visible')) {
							toolButtonClick(show_sel, true);
							return;
						}
						if (toolButtonClick(show_sel) && flyout_funcs[opt]) {
							flyout_funcs[opt]();
						}
					});
					// $('#tools_rect').mouseleave(function(){$('#tools_rect').fadeOut();});
				});
				setFlyoutTitles();
				setFlyoutPositions();
			};

			var makeFlyoutHolder = function(id, child) {
				var div = $('<div>', {
					'class': 'tools_flyout',
					id: id
				}).appendTo('#svg_editor').append(child);

				return div;
			};

			var uaPrefix = (function() {
				var prop;
				var regex = /^(Moz|Webkit|Khtml|O|ms|Icab)(?=[A-Z])/;
				var someScript = document.getElementsByTagName('script')[0];
				for (prop in someScript.style) {
					if (regex.test(prop)) {
						// test is faster than match, so it's better to perform
						// that on the lot and match only when necessary
						return prop.match(regex)[0];
					}
				}
				// Nothing found so far?
				if ('WebkitOpacity' in someScript.style) {return 'Webkit';}
				if ('KhtmlOpacity' in someScript.style) {return 'Khtml';}

				return '';
			}());

			var scaleElements = function(elems, scale) {
				// var prefix = '-' + uaPrefix.toLowerCase() + '-'; // Currently unused
				var sides = ['top', 'left', 'bottom', 'right'];

				elems.each(function() {
					// Handled in CSS
					var i;
					var el = $(this);
					var w = el.outerWidth() * (scale - 1);
					var h = el.outerHeight() * (scale - 1);

					for (i = 0; i < 4; i++) {
						var s = sides[i];
						var cur = el.data('orig_margin-' + s);
						if (cur == null) {
							cur = parseInt(el.css('margin-' + s), 10);
							// Cache the original margin
							el.data('orig_margin-' + s, cur);
						}
						var val = cur * scale;
						if (s === 'right') {
							val += w;
						} else if (s === 'bottom') {
							val += h;
						}

						el.css('margin-' + s, val);
					}
				});
			};

			var setIconSize = editor.setIconSize = function (size) {

				var sel_toscale = '#tools_top .toolset, #editor_panel > *, #history_panel > *,'+
'				#main_button, #tools_left > *, #multiselected_panel > *,'+
'				#g_panel > *, #tool_font_size > *, .tools_flyout';

				var elems = $(sel_toscale);
				var scale = 1;

				if (typeof size === 'number') {
					scale = size;
				} else {
					var icon_sizes = {s: 0.75, m:1, l: 1.25, xl: 1.5};
					scale = icon_sizes[size];
				}

				editor.tool_scale = scale;

				setFlyoutPositions();

				var hidden_ps = elems.parents(':hidden');
				hidden_ps.css('visibility', 'hidden').show();
				scaleElements(elems, scale);
				hidden_ps.css('visibility', 'visible').hide();
//				return;

				$.pref('iconsize', size);
				$('#iconsize').val(size);

				// Note that all rules will be prefixed with '#svg_editor' when parsed
				var cssResizeRules = {
					'#tools_top': {
						'left': 50 + $('#main_button').width(),
						'height': 72
					},
					'#tools_left': {
						'width': 31,
						'top': 74
					},
					'div#workarea': {
						'left': 38,
						'top': 74
					}
				};

				var rule_elem = $('#tool_size_rules');
				if (!rule_elem.length) {
					rule_elem = $('<style id="tool_size_rules"></style>').appendTo('head');
				} else {
					rule_elem.empty();
				}

				if (size !== 'm') {
					var styleStr = '';
					$.each(cssResizeRules, function(selector, rules) {
						selector = '#svg_editor ' + selector.replace(/,/g,', #svg_editor');
						styleStr += selector + '{';
						$.each(rules, function(prop, values) {
							var val;
							if (typeof values === 'number') {
								val = (values * scale) + 'px';
							} else if (values[size] || values.all) {
								val = (values[size] || values.all);
							}
							styleStr += (prop + ':' + val + ';');
						});
						styleStr += '}';
					});
					var prefix = '-' + uaPrefix.toLowerCase() + '-';
					styleStr += (sel_toscale + '{' + prefix + 'transform: scale(' + scale + ');}'
					+ ' #svg_editor div.toolset .toolset {' + prefix + 'transform: scale(1); margin: 1px !important;}' // Hack for markers
					+ ' #svg_editor .ui-slider {' + prefix + 'transform: scale(' + (1/scale) + ');}' // Hack for sliders
					);
					rule_elem.text(styleStr);
				}

				setFlyoutPositions();
			};

			// TODO: Combine this with addDropDown or find other way to optimize
			var addAltDropDown = function(elem, list, callback, opts) {
				var button = $(elem);
				list = $(list);
				var on_button = false;
				var dropUp = opts.dropUp;
				if (dropUp) {
					$(elem).addClass('dropup');
				}
				list.find('li').bind('mouseup', function() {
					if (opts.seticon) {
						setIcon('#cur_' + button[0].id , $(this).children());
						$(this).addClass('current').siblings().removeClass('current');
					}
					callback.apply(this, arguments);

				});

				$(window).mouseup(function(evt) {
					if (!on_button) {
						button.removeClass('down');
						list.hide();
						list.css({top:0, left:0});
					}
					on_button = false;
				});

				button.bind('mousedown',function() {
					var off = button.offset();
					if (dropUp) {
						off.top -= list.height();
						off.left += 8;
					} else {
						off.top += button.height();
					}
					list.offset(off);

					if (!button.hasClass('down')) {
						list.show();
						on_button = true;
					} else {
						// CSS position must be reset for Webkit
						list.hide();
						list.css({top:0, left:0});
					}
					button.toggleClass('down');
				}).hover(function() {
					on_button = true;
				}).mouseout(function() {
					on_button = false;
				});

				if (opts.multiclick) {
					list.mousedown(function() {
						on_button = true;
					});
				}
			};

			/*var extsPreLang = [];*/
			var extAdded = function(win, ext) {
				if (!ext) {
					return;
				}
				var cb_called = false;
				var resize_done = false;
				var cb_ready = true; // Set to false to delay callback (e.g. wait for $.svgIcons)
				
				function prepResize() {
					if (resize_timer) {
						clearTimeout(resize_timer);
						resize_timer = null;
					}
					if (!resize_done) {
						resize_timer = setTimeout(function() {
							resize_done = true;
							setIconSize($.pref('iconsize'));
						}, 50);
					}
				}

				var runCallback = function() {
					if (ext.callback && !cb_called && cb_ready) {
						cb_called = true;
						ext.callback();
					}
				};

				var btn_selects = [];

				if (ext.context_tools) {
					$.each(ext.context_tools, function(i, tool) {
						// Add select tool
						var html;
						var cont_id = tool.container_id ? (' id="' + tool.container_id + '"') : '';
						var panel = $('#' + tool.panel);

						// create the panel if it doesn't exist
						if (!panel.length) {
							panel = $('<div>', {id: tool.panel}).appendTo('#tools_top');
						}

						// TODO: Allow support for other types, or adding to existing tool
						switch (tool.type) {
						case 'tool_button':
							html = '<div class="tool_button">' + tool.id + '</div>';
							var div = $(html).appendTo(panel);
							if (tool.events) {
								$.each(tool.events, function(evt, func) {
									$(div).bind(evt, func);
								});
							}
							break;
						case 'select':
							html = '<label' + cont_id + '>'
								+ '<select id="' + tool.id + '">';
							$.each(tool.options, function(val, text) {
								var sel = (val == tool.defval) ? ' selected' : '';
								html += '<option value="'+val+'"' + sel + '>' + text + '</option>';
							});
							html += '</select></label>';
							// Creates the tool, hides & adds it, returns the select element
							var sel = $(html).appendTo(panel).find('select');

							$.each(tool.events, function(evt, func) {
								$(sel).bind(evt, func);
							});
							break;
						case 'button-select':
							html = '<div id="' + tool.id + '" class="dropdown toolset" title="' + tool.title + '">'
								+ '<div id="cur_' + tool.id + '" class="icon_label"></div><button></button></div>';

							var list = $('<ul id="' + tool.id + '_opts"></ul>').appendTo('#option_lists');

							if (tool.colnum) {
								list.addClass('optcols' + tool.colnum);
							}

							// Creates the tool, hides & adds it, returns the select element
							var dropdown = $(html).appendTo(panel).children();

							btn_selects.push({
								elem: ('#' + tool.id),
								list: ('#' + tool.id + '_opts'),
								title: tool.title,
								callback: tool.events.change,
								cur: ('#cur_' + tool.id)
							});

							break;
						case 'input':
							html = '<label' + cont_id + '>'
								+ '<span id="' + tool.id + '_label">'
								+ tool.label + ':</span>'
								+ '<input id="' + tool.id + '" title="' + tool.title
								+ '" size="' + (tool.size || '4') + '" value="' + (tool.defval || '') + '" type="text"/></label>';

							// Creates the tool, hides & adds it, returns the select element

							// Add to given tool.panel
							var inp = $(html).appendTo(panel).find('input');

							if (tool.spindata) {
								inp.SpinButton(tool.spindata);
							}

							if (tool.events) {
								$.each(tool.events, function(evt, func) {
									inp.bind(evt, func);
								});
							}
							break;

						default:
							break;
						}
					});
				}

				if (ext.buttons) {
					var fallback_obj = {},
						placement_obj = {},
						svgicons = ext.svgicons,
						holders = {};

					// Add buttons given by extension
					$.each(ext.buttons, function(i, btn) {
						var icon, svgicon, tls_id;
						var id = btn.id;
						var num = i;

						// Give button a unique ID
						while($('#'+id).length) {
							id = btn.id + '_' + (++num);
						}

						if (!svgicons) {
							icon = $('<img src="' + btn.icon + '">');
						} else {
							fallback_obj[id] = btn.icon;
							svgicon = btn.svgicon || btn.id;
							if (btn.type == 'app_menu') {
								placement_obj['#' + id + ' > div'] = svgicon;
							} else {
								placement_obj['#' + id] = svgicon;
							}
						}

						var cls, parent;

						// Set button up according to its type
						switch ( btn.type ) {
						case 'mode_flyout':
						case 'mode':
							cls = 'tool_button';
							parent = '#tools_left';
							break;
						case 'context':
							cls = 'tool_button';
							parent = '#' + btn.panel;
							// create the panel if it doesn't exist
							if (!$(parent).length) {
								$('<div>', {id: btn.panel}).appendTo('#tools_top');
							}
							break;
						case 'app_menu':
							cls = '';
							parent = '#main_menu ul';
							break;
						}
						var flyout_holder, cur_h, show_btn, ref_data, ref_btn;
						var button = $((btn.list || btn.type == 'app_menu') ? '<li/>' : '<div/>')
							.attr('id', id)
							.attr('title', btn.title)
							.addClass(cls);
						if (!btn.includeWith && !btn.list) {
							if ('position' in btn) {
								if ($(parent).children().eq(btn.position).length) {
									$(parent).children().eq(btn.position).before(button);
								}
								else {
									$(parent).children().last().before(button);
								}
							} else {
								button.appendTo(parent);
							}

							if (btn.type =='mode_flyout') {
								ref_btn = $(button);

								flyout_holder = ref_btn.parent();
								// Create a flyout menu if there isn't one already
								if (!ref_btn.parent().hasClass('tools_flyout')) {
									// Create flyout placeholder
									tls_id = ref_btn[0].id.replace('tool_', 'tools_');
									show_btn = ref_btn.clone()
										.attr('id', tls_id + '_show')
										.append($('<div>', {'class': 'flyout_arrow_horiz'}));

									ref_btn.before(show_btn);

									// Create a flyout div
									flyout_holder = makeFlyoutHolder(tls_id, ref_btn);
									flyout_holder.data('isLibrary', true);
									show_btn.data('isLibrary', true);
								}

								placement_obj['#' + tls_id + '_show'] = btn.id;
								// TODO: Find way to set the current icon using the iconloader if this is not default

								// Include data for extension button as well as ref button
								cur_h = holders['#'+flyout_holder[0].id] = [{
									sel: '#'+id,
									fn: btn.events.click,
									icon: btn.id,
									isDefault: true
								}, ref_data];
							} else if (btn.type == 'app_menu') {
								button.append('<div>').append(btn.title);
							}

						}
						else if (btn.list) {
							// Add button to list
							button.addClass('push_button');
							$('#' + btn.list + '_opts').append(button);
							if (btn.isDefault) {
								$('#cur_' + btn.list).append(button.children().clone());
								svgicon = btn.svgicon || btn.id;
								placement_obj['#cur_' + btn.list] = svgicon;
							}
						}
						else if (btn.includeWith) {
							// Add to flyout menu / make flyout menu
							var opts = btn.includeWith;
							// opts.button, default, position
							ref_btn = $(opts.button);

							flyout_holder = ref_btn.parent();
							// Create a flyout menu if there isn't one already
							if (!ref_btn.parent().hasClass('tools_flyout')) {
								// Create flyout placeholder
								tls_id = ref_btn[0].id.replace('tool_', 'tools_');
								show_btn = ref_btn.clone()
									.attr('id',tls_id + '_show')
									.append($('<div>', {'class': 'flyout_arrow_horiz'}));

								ref_btn.before(show_btn);

								// Create a flyout div
								flyout_holder = makeFlyoutHolder(tls_id, ref_btn);
							}

							ref_data = Actions.getButtonData(opts.button);

							if (opts.isDefault) {
								placement_obj['#' + tls_id + '_show'] = btn.id;
							}
							// TODO: Find way to set the current icon using the iconloader if this is not default

							// Include data for extension button as well as ref button
							cur_h = holders['#' + flyout_holder[0].id] = [{
								sel: '#' + id,
								fn: btn.events.click,
								icon: btn.id,
								key: btn.key,
								isDefault: btn.includeWith ? btn.includeWith.isDefault : 0
							}, ref_data];

							var pos = ('position' in opts) ? opts.position : 'last';
							var len = flyout_holder.children().length;

							// Add at given position or end
							if (!isNaN(pos) && pos >= 0 && pos < len) {
								flyout_holder.children().eq(pos).before(button);
							} else {
								flyout_holder.append(button);
								cur_h.reverse();
							}
						}

						if (!svgicons) {
							button.append(icon);
						}

						if (!btn.list) {
							// Add given events to button
							$.each(btn.events, function(name, func) {
								if (name == 'click' && btn.type == 'mode') {
									if (btn.includeWith) {
										button.bind(name, func);
									} else {
										button.bind(name, function() {
											if (toolButtonClick(button)) {
												func();
											}
										});
									}
									if (btn.key) {
										$(document).bind('keydown', btn.key, func);
										if (btn.title) {
											button.attr('title', btn.title + ' ['+btn.key+']');
										}
									}
								} else {
									button.bind(name, func);
								}
							});
						}

						setupFlyouts(holders);
					});

					$.each(btn_selects, function() {
						addAltDropDown(this.elem, this.list, this.callback, {seticon: true});
					});

					if (svgicons) {
						cb_ready = false; // Delay callback
					}

					$.svgIcons(svgicons, {
						w: 24, h: 24,
						id_match: false,
						no_img: (!svgedit.browser.isWebkit()),
						fallback: fallback_obj,
						placement: placement_obj,
						callback: function (icons) {
							// Non-ideal hack to make the icon match the current size
							if ($.pref('iconsize') !== 'm') {
								prepResize();
							}
							cb_ready = true; // Ready for callback
							runCallback();
						}
					});
				}

				runCallback();
			};

			var getPaint = function(color, opac, type) {
				// update the editor's fill paint
				var opts = { alpha: opac };
				if (color.indexOf('url(#') === 0) {
					var refElem = svgCanvas.getRefElem(color);
					if (refElem) {
						refElem = refElem.cloneNode(true);
					} else {
						refElem = $('#' + type + '_color defs *')[0];
					}
					opts[refElem.tagName] = refElem;
				} else if (color.indexOf('#') === 0) {
					opts.solidColor = color.substr(1);
				} else {
					opts.solidColor = 'none';
				}
				return new $.jGraduate.Paint(opts);
			};

			$('#text').focus( function(){ textBeingEntered = true; } );
			$('#text').blur( function(){ textBeingEntered = false; } );

			// bind the selected event to our function that handles updates to the UI
			svgCanvas.bind('selected', selectedChanged);
			svgCanvas.bind('transition', elementTransition);
			svgCanvas.bind('changed', elementChanged);
			svgCanvas.bind('zoomed', zoomChanged);
			svgCanvas.bind('contextset', contextChanged);
			svgCanvas.bind('extension_added', extAdded);
			svgCanvas.textActions.setInputElem($('#text')[0]);

			var str = '<div class="palette_item" data-rgb="none"></div>';
			$.each(palette, function(i, item) {
				str += '<div class="palette_item" style="background-color: ' + item + ';" data-rgb="' + item + '"></div>';
			});
			$('#palette').append(str);

			// Set up editor background functionality
			// TODO add checkerboard as "pattern"
			var color_blocks = ['#FFF', '#888', '#000']; // ,'url(data:image/gif;base64,R0lGODlhEAAQAIAAAP%2F%2F%2F9bW1iH5BAAAAAAALAAAAAAQABAAAAIfjG%2Bgq4jM3IFLJgpswNly%2FXkcBpIiVaInlLJr9FZWAQA7)'];
			str = '';
			$.each(color_blocks, function() {
				str += '<div class="color_block" style="background-color:' + this + ';"></div>';
			});
			$('#bg_blocks').append(str);
			var blocks = $('#bg_blocks div');
			var cur_bg = 'cur_background';
			blocks.each(function() {
				var blk = $(this);
				blk.click(function() {
					blocks.removeClass(cur_bg);
					$(this).addClass(cur_bg);
				});
			});

			setBackground($.pref('bkgd_color'), $.pref('bkgd_url'));

			$('#image_save_opts input').val([$.pref('img_save')]);

			var changeRectRadius = function(ctl) {
				svgCanvas.setRectRadius(ctl.value);
			};

			var changeFontSize = function(ctl) {
				svgCanvas.setFontSize(ctl.value);
			};


			/*改变字体名称(新添加的函数)*/
			var font_English2Chinese = function(font_family){
				var out = font_family;
				var doc = document.getElementById("font_family_dropdown-list").children;
				for(var i=0;i<doc.length;i++){
					var english = doc[i].getAttribute("style").split(":")[1];
					var chinese = doc[i].textContent;
					if(font_family == english){
						out = chinese;
						break;
					}else if(font_family == chinese){
						out = english;
						break;
					}

				}
				return out;
			};

			var changeStrokeWidth = function(ctl) {
				var val = ctl.value;
				if (val == 0 && selectedElement && ['line', 'polyline'].indexOf(selectedElement.nodeName) >= 0) {
					val = ctl.value = 1;
				}
				svgCanvas.setStrokeWidth(val);
			};

			var changeRotationAngle = function(ctl) {
				svgCanvas.setRotationAngle(ctl.value);
				$('#tool_reorient').toggleClass('disabled', parseInt(ctl.value, 10) === 0);
			};
			
			var changeOpacity = function(ctl, val) {
				if (val == null) {val = ctl.value;}
				$('#group_opacity').val(val);
				if (!ctl || !ctl.handle) {
					$('#opac_slider').slider('option', 'value', val);
				}
				svgCanvas.setOpacity(val/100);
			};

			var changeBlur = function(ctl, val, noUndo) {
				if (val == null) {val = ctl.value;}
				$('#blur').val(val);
				var complete = false;
				if (!ctl || !ctl.handle) {
					$('#blur_slider').slider('option', 'value', val);
					complete = true;
				}
				if (noUndo) {
					svgCanvas.setBlurNoUndo(val);
				} else {
					svgCanvas.setBlur(val, complete);
				}
			};

			$('#stroke_style').change(function() {
				svgCanvas.setStrokeAttr('stroke-dasharray', $(this).val());
				operaRepaint();
			});

			$('#stroke_linejoin').change(function() {
				svgCanvas.setStrokeAttr('stroke-linejoin', $(this).val());
				operaRepaint();
			});

			// Lose focus for select elements when changed (Allows keyboard shortcuts to work better)
			$('select').change(function(){$(this).blur();});

			// fired when user wants to move elements to another layer
			var promptMoveLayerOnce = false;
			$('#selLayerNames').change(function() {
				var destLayer = this.options[this.selectedIndex].value;
				var confirmStr = uiStrings.notification.QmoveElemsToLayer.replace('%s', destLayer);
				var moveToLayer = function(ok) {
					if (!ok) {return;}
					promptMoveLayerOnce = true;
					svgCanvas.moveSelectedToLayer(destLayer);
					svgCanvas.clearSelection();
					populateLayers();
				};
				if (destLayer) {
					$.confirm(confirmStr, moveToLayer);
				}
			});

			$('#font_family').change(function() {
				svgCanvas.setFontFamily(font_English2Chinese(this.value));
			});

			$('#text').bind("keyup input", function() {
				svgCanvas.setTextContent(this.value);
			});

			// Prevent selection of elements when shift-clicking
			$('#palette').mouseover(function() {
				var inp = $('<input type="hidden">');
				$(this).append(inp);
				inp.focus().remove();
			});

			$('.palette_item').mousedown(function(evt) {
				// shift key or right click for stroke
				var picker = evt.shiftKey || evt.button === 2 ? 'stroke' : 'fill';
				var color = $(this).data('rgb');
				var paint;

				// Webkit-based browsers returned 'initial' here for no stroke
				if (color === 'none' || color === 'transparent' || color === 'initial') {
					color = 'none';
					paint = new $.jGraduate.Paint();
				} else {
					paint = new $.jGraduate.Paint({alpha: 100, solidColor: color.substr(1)});
				}

				paintBox[picker].setPaint(paint);
				svgCanvas.setColor(picker, color);

				if (color !== 'none' && svgCanvas.getPaintOpacity(picker) !== 1) {
					svgCanvas.setPaintOpacity(picker, 1.0);
				}
				updateToolButtonState();
			}).bind('contextmenu', function(e) {e.preventDefault();});

			$('#toggle_stroke_tools').on('click', function() {
				$('#tools_bottom').toggleClass('expanded');
			});

			(function() {
				var last_x = null, last_y = null, w_area = workarea[0],
					panning = false, keypan = false;

				$('#svgcanvas').bind('mousemove mouseup', function(evt) {
					if (panning === false) {return;}

					w_area.scrollLeft -= (evt.clientX - last_x);
					w_area.scrollTop -= (evt.clientY - last_y);

					last_x = evt.clientX;
					last_y = evt.clientY;

					if (evt.type === 'mouseup') {panning = false;}
					return false;
				}).mousedown(function(evt) {
					if (evt.button === 1 || keypan === true) {
						panning = true;
						last_x = evt.clientX;
						last_y = evt.clientY;
						return false;
					}
				});

				$(window).mouseup(function() {
					panning = false;
				});

				$(document).bind('keydown', 'space', function(evt) {
					svgCanvas.spaceKey = keypan = true;
					evt.preventDefault();
				}).bind('keyup', 'space', function(evt) {
					evt.preventDefault();
					svgCanvas.spaceKey = keypan = false;
				}).bind('keydown', 'shift', function(evt) {
					if (svgCanvas.getMode() === 'zoom') {
						workarea.css('cursor', zoomOutIcon);
					}
				}).bind('keyup', 'shift', function(evt) {
					if (svgCanvas.getMode() === 'zoom') {
						workarea.css('cursor', zoomInIcon);
					}
				});

				editor.setPanning = function(active) {
					svgCanvas.spaceKey = keypan = active;
				};
			}());

			(function () {
				var button = $('#main_icon');
				var overlay = $('#main_icon span');
				var list = $('#main_menu');
				var on_button = false;
				var height = 0;
				var js_hover = true;
				var set_click = false;

				$(window).mouseup(function(evt) {
					if (!on_button) {
						button.removeClass('buttondown');
						// do not hide if it was the file input as that input needs to be visible
						// for its change event to fire
						if (evt.target.tagName != 'INPUT') {
							list.fadeOut(200);
						} else if (!set_click) {
							set_click = true;
							$(evt.target).click(function() {
								list.css('margin-left', '-9999px').show();
							});
						}
					}
					on_button = false;
				}).mousedown(function(evt) {
//					$('.contextMenu').hide();
					var islib = $(evt.target).closest('div.tools_flyout, .contextMenu').length;
					if (!islib) {$('.tools_flyout:visible,.contextMenu').fadeOut(250);}
				});

				overlay.bind('mousedown',function() {
					if (!button.hasClass('buttondown')) {
						// Margin must be reset in case it was changed before;
						list.css('margin-left', 0).show();
						if (!height) {
							height = list.height();
						}
						// Using custom animation as slideDown has annoying 'bounce effect'
						list.css('height',0).animate({
							'height': height
						}, 200);
						on_button = true;
					} else {
						list.fadeOut(200);
					}
					button.toggleClass('buttondown buttonup');
				}).hover(function() {
					on_button = true;
				}).mouseout(function() {
					on_button = false;
				});

				var list_items = $('#main_menu li');

				// Check if JS method of hovering needs to be used (Webkit bug)
				list_items.mouseover(function() {
					js_hover = ($(this).css('background-color') == 'rgba(0, 0, 0, 0)');

					list_items.unbind('mouseover');
					if (js_hover) {
						list_items.mouseover(function() {
							this.style.backgroundColor = '#FFC';
						}).mouseout(function() {
							this.style.backgroundColor = 'transparent';
							return true;
						});
					}
				});

				$('#tool_prefs_option').unbind('mouseout');
				$('#tool_prefs_option').unbind('mouseover');
				$('#tool_prefs_option').bind('mouseout',function(e){
					$('#tool_prefs_option').removeClass('mouse');
				});
				$('#tool_prefs_option').bind('mouseover',function(e){
					$(e.target).addClass('mouse');
				});

			}());
			// Made public for UI customization.
			// TODO: Group UI functions into a public editor.ui interface.
			editor.addDropDown = function(elem, callback, dropUp) {
				if ($(elem).length == 0) {return;} // Quit if called on non-existant element
				var button = $(elem).find('button');
				var list = $(elem).find('ul').attr('id', $(elem)[0].id + '-list');
				var on_button = false;
				if (dropUp) {
					$(elem).addClass('dropup');
				} else {
					// Move list to place where it can overflow container
					$('#option_lists').append(list);
				}
				list.find('li').bind('mouseup', callback);

				$(window).mouseup(function(evt) {
					if (!on_button) {
						button.removeClass('down');
						list.hide();
					}
					on_button = false;
				});

				button.bind('mousedown',function() {
					if (!button.hasClass('down')) {
						if (!dropUp) {
							var pos = $(elem).position();
							list.css({
								top: pos.top + 24,
								left: pos.left - 10
							});
						}
						list.show();
						on_button = true;
					} else {
						list.hide();
					}
					button.toggleClass('down');
				}).hover(function() {
					on_button = true;
				}).mouseout(function() {
					on_button = false;
				});
			};

			editor.addDropDown('#font_family_dropdown', function() {
				$('#font_family').val($(this).text()).change();
			});

			editor.addDropDown('#opacity_dropdown', function() {
				if ($(this).find('div').length) {return;}
				var perc = parseInt($(this).text().split('%')[0], 10);
				changeOpacity(false, perc);
			}, true);

			// For slider usage, see: http://jqueryui.com/demos/slider/
			$('#opac_slider').slider({
				start: function() {
					$('#opacity_dropdown li:not(.special)').hide();
				},
				stop: function() {
					$('#opacity_dropdown li').show();
					$(window).mouseup();
				},
				slide: function(evt, ui) {
					changeOpacity(ui);
				}
			});

			editor.addDropDown('#blur_dropdown', $.noop);

			var slideStart = false;

			$('#blur_slider').slider({
				max: 10,
				step: 0.1,
				stop: function(evt, ui) {
					slideStart = false;
					changeBlur(ui);
					$('#blur_dropdown li').show();
					$(window).mouseup();
				},
				start: function() {
					slideStart = true;
				},
				slide: function(evt, ui) {
					changeBlur(ui, null, slideStart);
				}
			});

			editor.addDropDown('#zoom_dropdown', function() {
				var item = $(this);
				var val = item.data('val');
				if (val) {
					zoomChanged(window, val);
				} else {
					changeZoom({value: parseFloat(item.text())});
				}
			}, true);

			addAltDropDown('#stroke_linecap', '#linecap_opts', function() {
				setStrokeOpt(this, true);
			}, {dropUp: true});

			addAltDropDown('#stroke_linejoin', '#linejoin_opts', function() {
				setStrokeOpt(this, true);
			}, {dropUp: true});

			addAltDropDown('#tool_position', '#position_opts', function() {
				var letter = this.id.replace('tool_pos', '').charAt(0);
				svgCanvas.alignSelectedElements(letter, 'page');
			}, {multiclick: true});

			/*

			When a flyout icon is selected
				(if flyout) {
				- Change the icon
				- Make pressing the button run its stuff
				}
				- Run its stuff

			When its shortcut key is pressed
				- If not current in list, do as above
				, else:
				- Just run its stuff

			*/

			// Unfocus text input when workarea is mousedowned.
			(function() {
				var inp;
				var unfocus = function() {
					$(inp).blur();
				};

				$('#svg_editor').find('button, select, input:not(#text)').focus(function() {
					inp = this;
					ui_context = 'toolbars';
					workarea.mousedown(unfocus);
				}).blur(function() {
					ui_context = 'canvas';
					workarea.unbind('mousedown', unfocus);
					// Go back to selecting text if in textedit mode
					if (svgCanvas.getMode() == 'textedit') {
						$('#text').focus();
					}
				});
			}());

			var clickFHPath = function() {//铅笔工具
				if (toolButtonClick('#tool_fhpath')) {
					svgCanvas.setMode('fhpath');
				}
			};

			var clickLine = function() {//连接工具
				if (toolButtonClick('#tool_line')) {
					svgCanvas.setMode('line');
				}
			};

			var clickSquare = function() {//矩形----正方形
				if (toolButtonClick('#tool_square')) {
					svgCanvas.setMode('square');
				}
			};

			var clickRect = function() {//矩形
				if (toolButtonClick('#tool_rect')) {
					svgCanvas.setMode('rect');
				}
			};

			var clickFHRect = function() {//手绘矩形
				if (toolButtonClick('#tool_fhrect')) {
					svgCanvas.setMode('fhrect');
				}
			};

			var clickCircle = function() {//圆
				if (toolButtonClick('#tool_circle')) {
					svgCanvas.setMode('circle');
				}
			};

			var clickEllipse = function() {//椭圆
				if (toolButtonClick('#tool_ellipse')) {
					svgCanvas.setMode('ellipse');
				}
			};

			var clickFHEllipse = function() {//手绘椭圆
				if (toolButtonClick('#tool_fhellipse')) {
					svgCanvas.setMode('fhellipse');
				}
			};

			var clickImage = function() {//图像
				if (toolButtonClick('#tool_image')) {
					svgCanvas.setMode('image');
				}
			};

			var clickZoom = function() {//缩放
				if (toolButtonClick('#tool_zoom')) {
					svgCanvas.setMode('zoom');
					workarea.css('cursor', zoomInIcon);
				}
			};

			var zoomImage = function(multiplier) {
				var res = svgCanvas.getResolution();
				multiplier = multiplier ? res.zoom * multiplier : 1;
				// setResolution(res.w * multiplier, res.h * multiplier, true);
				$('#zoom').val(multiplier * 100);
				svgCanvas.setZoom(multiplier);
				zoomDone();
				updateCanvas(true);
			};

			var dblclickZoom = function() {
				if (toolButtonClick('#tool_zoom')) {
					zoomImage();
					setSelectMode();
				}
			};

			var clickText = function() {//文本
				if (toolButtonClick('#tool_text')) {
					svgCanvas.setMode('text');
				}
			};

			// Delete is a contextual tool that only appears in the ribbon if
			// an element has been selected
			var deleteSelected = function() {//删除
				if (selectedElement != null || multiselected) {
					svgCanvas.deleteSelectedElements();
				}
			};

			var cutSelected = function() {//剪切
				if (selectedElement != null || multiselected) {
					svgCanvas.cutSelectedElements();
				}
			};

			var copySelected = function() {//复制
				if (selectedElement != null || multiselected) {
					svgCanvas.copySelectedElements();
				}
			};

			var pasteInCenter = function() {//粘贴
				var zoom = svgCanvas.getZoom();
				var x = (workarea[0].scrollLeft + workarea.width()/2)/zoom - svgCanvas.contentW;
				var y = (workarea[0].scrollTop + workarea.height()/2)/zoom - svgCanvas.contentH;
				svgCanvas.pasteElements('point', x, y);
			};

			var moveToTopSelected = function() {//顶部对齐
				if (selectedElement != null) {
					svgCanvas.moveToTopSelectedElement();
				}
			};

			var moveToBottomSelected = function() {//底部对齐
				if (selectedElement != null) {
					svgCanvas.moveToBottomSelectedElement();
				}
			};

			var moveUpDownSelected = function(dir) {
				if (selectedElement != null) {
					svgCanvas.moveUpDownSelected(dir);
				}
			};

			var convertToPath = function() {
				if (selectedElement != null) {
					svgCanvas.convertToPath();
				}
			};

			var reorientPath = function() {
				if (selectedElement != null) {
					path.reorient();
				}
			};

			var moveSelected = function(dx,dy) {
				if (selectedElement != null || multiselected) {
					if (curConfig.gridSnapping) {
						// Use grid snap value regardless of zoom level
						var multi = svgCanvas.getZoom() * curConfig.snappingStep;
						dx *= multi;
						dy *= multi;
					}
					svgCanvas.moveSelectedElements(dx,dy);
				}
			};

			var linkControlPoints = function() {
				$('#tool_node_link').toggleClass('push_button_pressed tool_button');
				var linked = $('#tool_node_link').hasClass('push_button_pressed');
				path.linkControlPoints(linked);
			};

			var clonePathNode = function() {
				if (path.getNodePoint()) {
					path.clonePathNode();
				}
			};

			var deletePathNode = function() {
				if (path.getNodePoint()) {
					path.deletePathNode();
				}
			};

			var addSubPath = function() {
				var button = $('#tool_add_subpath');
				var sp = !button.hasClass('push_button_pressed');
				button.toggleClass('push_button_pressed tool_button');
				path.addSubPath(sp);
			};

			var opencloseSubPath = function() {
				path.opencloseSubPath();
			};

			var selectNext = function() {
				svgCanvas.cycleElement(1);
			};

			var selectPrev = function() {
				svgCanvas.cycleElement(0);
			};

			var rotateSelected = function(cw, step) {
				if (selectedElement == null || multiselected) {return;}
				if (!cw) {step *= -1;}
				var angle = parseFloat($('#angle').val()) + step;
				svgCanvas.setRotationAngle(angle);
				updateContextPanel();
			};

			var clickBold = function() {//文字设置黑体
				svgCanvas.setBold( !svgCanvas.getBold() );
				updateContextPanel();
				return false;
			};

			var clickItalic = function() {//文字设置斜体
				svgCanvas.setItalic( !svgCanvas.getItalic() );
				updateContextPanel();
				return false;
			};

			var exportAndShare = function(type){
				var prompt_text = '请选择输出图片的格式: ';
				if(type == "share"){
					prompt_text = '请选择分享图片的格式: ';
				}
				$.select(prompt_text, ['PNG','JPEG', 'BMP', 'WEBP'], function (imgType) { // todo: replace hard-coded msg with uiStrings.notification.
					if (!imgType) {
						return;
					}
					$("#spinner").css("display","block");
					var str = (new XMLSerializer()).serializeToString($('#svgcontent')[0]);
					var xmlObj = $.parseXML(str);//xml对象
					var svg = $(xmlObj).find("svg");
					var imageObj = $(xmlObj).find("image");
					var viewBox = document.getElementById("svgcontent").getAttribute("viewBox");
					var height = parseInt(viewBox.split(' ')[3]);
					var width = parseInt(viewBox.split(' ')[2]);
					if(!this.scaleClick){
						var dpi = 288;//默认dpi
						var scale = mapProperties.scale;//比例尺
						var size = calcMapSize(scale);//地图尺寸
						var mapPixelWidth = dpi*size.w/2.54;//该分辨率下地图像素宽
						this.scaleClick = mapPixelWidth/mapProperties.width;
					}
					var mapScale = this.scaleClick == 0 ? 4 : this.scaleClick;
					var svgScale = mapScale/mapProperties.zoom;
					svg.attr("height",height*svgScale);
					svg.attr("width",width*svgScale);
					var options = window.OPTIONS;
					if(document.getElementById("mapImg")&&options){
						createPrintMap(mapStyle,mapScale,function(blob){
							var objectUrl = window.URL.createObjectURL(blob);
							getDataUri(objectUrl, function(dataUri) {
								url = dataUri;
								imageObj.attr("xlink:href",url);
								var quality = parseInt($('#image-slider').val(), 10)/100;
								if((/Trident\/7\./).test(navigator.userAgent)||(/Trident\/6\./).test(navigator.userAgent)){//IE10/IE11
									svg.removeAttr("x");
									svg.removeAttr("y");
									ieDownload(svg[0],imgType,quality)
								}else{
									str = (new XMLSerializer()).serializeToString(xmlObj);	
									downLoad(str,imgType,quality);
								}
							});
						});
					}else{
						var quality = parseInt($('#image-slider').val(), 10)/100;
						if((/Trident\/7\./).test(navigator.userAgent)||(/Trident\/6\./).test(navigator.userAgent)){
							ieDownload()
						}else{
							str = (new XMLSerializer()).serializeToString(xmlObj);
							downLoad(str,imgType,quality);
						}	
					}

					function ieDownload(svg,imgType,quality){
						if(imgType==="JPEG"||imgType==="WEBP"){
							var quality=quality||1;
						}
						
						svg.toDataURL("image/png", {
						    callback: function(data) {
						    	var image = new Image();
						    	image.crossOrigin = "Anonymous";
						        image.setAttribute("src", data)
						        image.onload=function(){
						        	onSvgImageLoad(this,imgType,quality);
						        }	
						    }
						})
					}
					function downLoad(str,imgType,quality){	
						if(imgType==="JPEG"||imgType==="WEBP"){
							var quality=quality||1;
						}
						var svgXml = str;
						var image1 = new Image();
						image1.src = 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(svgXml))); //给图片对象写入base64编码的svg流

						image1.onload=function(){
							onSvgImageLoad(this,imgType,quality);
						}
					};
					
					function onSvgImageLoad(image,imgType,quality){
						var canvas = document.getElementById('myCanvas');  //准备空画布
						document.getElementById('myCanvas').setAttribute("width",image.width);
						document.getElementById('myCanvas').setAttribute("height",image.height);
						var context = canvas.getContext('2d');  //取得画布的2d绘图上下文
						context.fillStyle = "#ffffff";
						context.fillRect(0,0,image.width,image.height);
						context.drawImage(image, 0, 0);
						var filename = document.getElementById("title_name").innerHTML||"辅助决策用图";
						if(imgType==="JPEG"){
							canvas.toBlob(function(blob) {
								if(type === "share"){
									uploadImg(blob,imgType,filename)
								}else if(type === "export"){
									$("#spinner").css("display","none");
									saveAs(blob, filename+".jpg");
								}
							},"image/jpeg",quality);
						}else if(imgType==="WEBP"){
							canvas.toBlob(function(blob) {
								if(type === "share"){
									uploadImg(blob,imgType,filename)
								}else if(type === "export"){
									$("#spinner").css("display","none");
									saveAs(blob, filename+".webp");
								}
							},"image/webp",quality);
						}else if(imgType==="PNG"){
							canvas.toBlob(function(blob) {
								if(type === "share"){
									uploadImg(blob,imgType,filename)
								}else if(type === "export"){
									$("#spinner").css("display","none");
									saveAs(blob, filename+".png");
								}
							},"image/png");
						}else if(imgType==="BMP"){
							canvas.toBlob(function(blob) {
								if(type === "share"){
									uploadImg(blob,imgType,filename)
								}else if(type === "export"){
									$("#spinner").css("display","none");
									saveAs(blob, filename+".bmp");
								}
							},"image/bmp");
						}
					}
					function getDataUri(url, callback) {
						var image2 = new Image();
					    image2.onload = function () {
					        var canvas = document.createElement('canvas');
					        canvas.width = this.width; // or 'width' if you want a special/scaled size
					        canvas.height = this.height; // or 'height' if you want a special/scaled size
					        canvas.getContext('2d').drawImage(this, 0, 0);
					        // Get raw image data
					        var raw="data:image/png;base64,"+canvas.toDataURL('image/png').replace(/^data:image\/(png|jpg);base64,/, '');
					        callback(raw);
					    };
					    image2.crossOrigin = "Anonymous";
					    image2.src = url;
					};

					function uploadImg(blob,imgType,filename){
						var options = window.OPTIONS;
						var upload_url = options.API.uploads + '/' + options.username+'?access_token='+options.access_token;
						var location = options.location;
						if(options.selectedDistrict){
							location = options.selectedDistrict;
						}
						var formData = new FormData();
						formData.append("image", blob, filename+"."+imgType.toLowerCase());
						formData.append('year', new Date().getFullYear());
						formData.append('name', filename);
						formData.append('location', location);
						if(options.scale){
							formData.append('scale',options.scale);
						}
						
						var xhr = new XMLHttpRequest();
						//设置回调函数    
						xhr.onreadystatechange = function(){
						    if(xhr.readyState == 4 && xhr.status == 200){    
						        var b = xhr.responseText;    
						        if(b){    
						        	$("#spinner").css("display","none");
						        	alert("已成功分享到决策用图！");
						        }else{  
						        	$("#spinner").css("display","none");
						        	alert("分享失败！");
						        }           
						    } 
						};
						xhr.open('POST', upload_url, true);
						xhr.send(formData);	
					}
				}, function () {
					var sel = $(this);
					if (sel.val() === 'JPEG' || sel.val() === 'WEBP') {
						if (!$('#image-slider').length) {
							$('<div style="margin-top: 10px;"><label>压缩质量: <input id="image-slider" type="range" min="1" max="100" value="92" style="background-color: #eee;border-radius: 15px;-webkit-appearance: none;height: 10px;width: 240px;margin-left: 5px;-webkit-box-shadow: 0 1px 0 0px #959595, 0 1px 0 #959595 inset, 0px 2px 10px 0px #959595 inset, 1px 0px 2px rgba(0, 0, 0, 0.4) inset, 0 0px 1px rgba(0, 0, 0, 0.6) inset;"/></label></div>').appendTo(sel.parent()); // Todo: i18n-ize label
						}
					}
					else {
						$('#image-slider').parent().remove();
					}
				});

				var sel = $("#dialog_content select");
				if (!$('#image-resolution').length) {
					$('<div id="image-resolution"><span>分辨率: </span><div class="resolution"><span>72</span></div><div class="resolution"><span>144</span></div><div class="resolution"><span>216</span></div><div class="resolution click"><span>288</span></div></div>').appendTo(sel.parent()); // Todo: i18n-ize label
					var that = this;
					that.scaleClick = 0;
					$('#image-resolution .resolution').bind('click',function(e){
						$('#image-resolution .resolution').removeClass('click');
						var parent = $(e.target).parent(".resolution");
						parent.length == 0 ? $(e.target).addClass('click') : parent.addClass('click');
						var dpi = parseInt($(e.target).text());
						var scale = mapProperties.scale;//比例尺
						var size = calcMapSize(scale);//地图尺寸
						var mapPixelWidth = dpi*size.w/2.54;//该分辨率下地图像素宽
						that.scaleClick = mapPixelWidth/mapProperties.width;
					});
				}
			};

			//新增分享到决策用图模块
			//制图————分享
			var clickShare = function(){
				exportAndShare('share');
			};
			//制图————导出
			var clickExport = function() {
				exportAndShare('export');		
			};


			var clickUndo = function() {
				if (undoMgr.getUndoStackSize() > 0) {
					undoMgr.undo();
					populateLayers();
				}
			};

			var clickRedo = function() {
				if (undoMgr.getRedoStackSize() > 0) {
					undoMgr.redo();
					populateLayers();
				}
			};

			var clickGroup = function() {//组合或取消组合
				// group
				if (multiselected) {
					svgCanvas.groupSelectedElements();
				}
				// ungroup
				else if (selectedElement) {
					svgCanvas.ungroupSelectedElement();
				}
			};

			$('#svg_docprops_container, #svg_prefs_container').draggable({cancel: 'button,fieldset', containment: 'window'});

			//“制图”菜单点击“输出属性”
			var showDocProperties = function() {
				if (docprops) {return;}
				docprops = true;

				// This selects the correct radio button by using the array notation
				$('#image_save_opts input').val([$.pref('img_save')]);

				// update resolution option with actual resolution
				var res = svgCanvas.getResolution();
				if (curConfig.baseUnit !== 'px') {
					res.w = svgedit.units.convertUnit(res.w) + curConfig.baseUnit;
					res.h = svgedit.units.convertUnit(res.h) + curConfig.baseUnit;
				}

				$('#canvas_width').val(res.w);
				$('#canvas_height').val(res.h);
				var filename = document.getElementById("title_name").innerHTML;
				$('#canvas_title').val(filename);

				$('#tool_docprops_save').bind('mouseout',function(e){
					$('#tool_docprops_save').removeClass('mouse');
				});
				$('#tool_docprops_save').bind('mouseover',function(e){
					$(e.target).addClass('mouse');
				});
				$('#tool_docprops_cancel').bind('mouseout',function(e){
					$('#tool_docprops_cancel').removeClass('mouse');
				});
				$('#tool_docprops_cancel').bind('mouseover',function(e){
					$(e.target).addClass('mouse');
				});
				$('#svg_docprops').show();
			};

			//“制图”菜单点击“选项”
			var showPreferences = function() {
				if (preferences) {return;}
				preferences = true;
				$('#main_menu').hide();

				// Update background color with current one
				var blocks = $('#bg_blocks div');
				var cur_bg = 'cur_background';
				var canvas_bg = curPrefs.bkgd_color;
				var url = $.pref('bkgd_url');
				blocks.each(function() {
					var blk = $(this);
					var is_bg = blk.css('background-color') == canvas_bg;
					blk.toggleClass(cur_bg, is_bg);
					if (is_bg) {$('#canvas_bg_url').removeClass(cur_bg);}
				});
				if (!canvas_bg) {blocks.eq(0).addClass(cur_bg);}
				if (url) {
					$('#canvas_bg_url').val(url);
				}

				$('#tool_prefs_save').bind('mouseout',function(e){
					$('#tool_prefs_save').removeClass('mouse');
				});
				$('#tool_prefs_save').bind('mouseover',function(e){
					$(e.target).addClass('mouse');
				});
				$('#tool_prefs_cancel').bind('mouseout',function(e){
					$('#tool_prefs_cancel').removeClass('mouse');
				});
				$('#tool_prefs_cancel').bind('mouseover',function(e){
					$(e.target).addClass('mouse');
				});
				$('#svg_prefs').show();
				
			};

			var hideSourceEditor = function() {
				$('#svg_source_editor').hide();
				editingsource = false;
				$('#svg_source_textarea').blur();
			};

			var saveSourceEditor = function() {
				if (!editingsource) {return;}

				var saveChanges = function() {
					svgCanvas.clearSelection();
					hideSourceEditor();
					zoomImage();
					populateLayers();
					updateTitle();
					prepPaints();
				};

				if (!svgCanvas.setSvgString($('#svg_source_textarea').val())) {
					$.confirm(uiStrings.notification.QerrorsRevertToSource, function(ok) {
						if (!ok) {return false;}
						saveChanges();
					});
				} else {
					saveChanges();
				}
				setSelectMode();
			};

			var hideDocProperties = function() {
				$('#svg_docprops').hide();
				$('#canvas_width,#canvas_height').removeAttr('disabled');
				$('#paper')[0].selectedIndex = 0;
				$('#image_save_opts input').val([$.pref('img_save')]);
				docprops = false;
			};

			var hidePreferences = function() {
				$('#svg_prefs').hide();
				preferences = false;
			};

			var saveDocProperties = function() {
				// set title
				var newTitle = $('#canvas_title').val();
				updateTitle(newTitle);
				svgCanvas.setDocumentTitle(newTitle);

				// update resolution
				var width = $('#canvas_width'), w = width.val();
				var height = $('#canvas_height'), h = height.val();

				if (w != 'fit' && !svgedit.units.isValidUnit('width', w)) {
					$.alert(uiStrings.notification.invalidAttrValGiven);
					width.parent().addClass('error');
					return false;
				}

				width.parent().removeClass('error');

				if (h != 'fit' && !svgedit.units.isValidUnit('height', h)) {
					$.alert(uiStrings.notification.invalidAttrValGiven);
					height.parent().addClass('error');
					return false;
				}

				height.parent().removeClass('error');

				if (!svgCanvas.setResolution(w, h)) {
					$.alert(uiStrings.notification.noContentToFitTo);
					return false;
				}

				var scale = mapProperties.scale = Number($("#scale_ratio").val());
				updateMapFrame(scale,newTitle);

				updateCanvas();
				hideDocProperties();
			};
			
			var updateMapFrame = function(scale,newTitle){
				if(scale){
					var width = mapProperties.width*mapProperties.zoom;
					var height = mapProperties.height*mapProperties.zoom;
					var scaleElement = document.getElementById("scale-text");
					if(scaleElement){scaleElement.innerHTML = "比例尺：1:"+scale;}
					changeSVGTemple(width,height,newTitle);
				}else{
					changeSVGTemple(0,0,newTitle);
				}
			}

			var savePreferences = editor.savePreferences = function() {
				// Set background
				var color = $('#bg_blocks div.cur_background').css('background-color') || '#FFF';
				setBackground(color, $('#canvas_bg_url').val());

				// set icon size
				setIconSize($('#iconsize').val());

				curConfig.showRulers = $('#show_rulers')[0].checked;

				$('#rulers').toggle(curConfig.showRulers);
				if (curConfig.showRulers) {updateRulers();}
				curConfig.baseUnit = $('#base_unit').val();

				svgCanvas.setConfig(curConfig);

				updateCanvas();
				hidePreferences();
			};

			var resetScrollPos = $.noop;

			var cancelOverlays = function() {
				$('#dialog_box').hide();
				if (!editingsource && !docprops && !preferences) {
					if (cur_context) {
						svgCanvas.leaveContext();
					}
					return;
				}

				if (editingsource) {
					if (origSource !== $('#svg_source_textarea').val()) {
						$.confirm(uiStrings.notification.QignoreSourceChanges, function(ok) {
							if (ok) {hideSourceEditor();}
						});
					} else {
						hideSourceEditor();
					}
				} else if (docprops) {
					hideDocProperties();
				} else if (preferences) {
					hidePreferences();
				}
				resetScrollPos();
			};

			var win_wh = {width:$(window).width(), height:$(window).height()};

			// Fix for Issue 781: Drawing area jumps to top-left corner on window resize (IE9)
			if (svgedit.browser.isIE()) {
				(function() {
					resetScrollPos = function() {
						if (workarea[0].scrollLeft === 0 && workarea[0].scrollTop === 0) {
							workarea[0].scrollLeft = curScrollPos.left;
							workarea[0].scrollTop = curScrollPos.top;
						}
					};

					curScrollPos = {
						left: workarea[0].scrollLeft,
						top: workarea[0].scrollTop
					};

					$(window).resize(resetScrollPos);
					editor.ready(function() {
						// TODO: Find better way to detect when to do this to minimize
						// flickering effect
						setTimeout(function() {
							resetScrollPos();
						}, 500);
					});

					workarea.scroll(function() {
						curScrollPos = {
							left: workarea[0].scrollLeft,
							top: workarea[0].scrollTop
						};
					});
				}());
			}

			$(window).resize(function(evt) {
				$.each(win_wh, function(type, val) {
					var curval = $(window)[type]();
					workarea[0]['scroll' + (type === 'width' ? 'Left' : 'Top')] -= (curval - val)/2;
					win_wh[type] = curval;
				});
				setFlyoutPositions();
			});

			(function() {
				workarea.scroll(function() {
					// TODO: jQuery's scrollLeft/Top() wouldn't require a null check
					if ($('#ruler_x').length != 0) {
						$('#ruler_x')[0].scrollLeft = workarea[0].scrollLeft;
					}
					if ($('#ruler_y').length != 0) {
						$('#ruler_y')[0].scrollTop = workarea[0].scrollTop;
					}
				});

			}());

			$('#url_notice').click(function() {
				$.alert(this.title);
			});

			// added these event handlers for all the push buttons so they
			// behave more like buttons being pressed-in and not images
			(function() {
				var toolnames = ['clear', 'open', 'save', 'source', 'delete', 'delete_multi', 'paste', 'clone', 'clone_multi', 'move_top', 'move_bottom'];
				var all_tools = '';
				var cur_class = 'tool_button_current';

				$.each(toolnames, function(i, item) {
					all_tools += (i ? ',' : '') + '#tool_' + item;
				});

				$(all_tools).mousedown(function() {
					$(this).addClass(cur_class);
				}).bind('mousedown mouseout', function() {
					$(this).removeClass(cur_class);
				});

				$('#tool_undo, #tool_redo').mousedown(function() {
					if (!$(this).hasClass('disabled')) {$(this).addClass(cur_class);}
				}).bind('mousedown mouseout',function() {
					$(this).removeClass(cur_class);}
				);
			}());

			// switch modifier key in tooltips if mac
			// NOTE: This code is not used yet until I can figure out how to successfully bind ctrl/meta
			// in Opera and Chrome
			if (svgedit.browser.isMac() && !window.opera) {
				var shortcutButtons = ['tool_source', 'tool_undo', 'tool_redo'];
				i = shortcutButtons.length;
				while (i--) {
					var button = document.getElementById(shortcutButtons[i]);
					if (button) {
						var title = button.title;
						var index = title.indexOf('Ctrl+');
						button.title = [title.substr(0, index), 'Cmd+', title.substr(index + 5)].join('');
					}
				}
			}

			// TODO: go back to the color boxes having white background-color and then setting
			//	background-image to none.png (otherwise partially transparent gradients look weird)
			var colorPicker = function(elem) {
				var picker = elem.attr('id') == 'stroke_color' ? 'stroke' : 'fill';
//				var opacity = (picker == 'stroke' ? $('#stroke_opacity') : $('#fill_opacity'));
				var paint = paintBox[picker].paint;
				var title = (picker == 'stroke' ? 'Pick a Stroke Paint and Opacity' : 'Pick a Fill Paint and Opacity');
				var pos = elem.offset();
				$('#color_picker')
					.draggable({cancel: '.jGraduate_tabs, .jGraduate_colPick, .jGraduate_gradPick, .jPicker', containment: 'window'})
					.css(curConfig.colorPickerCSS || {'left': pos.left - 140, 'bottom': 40})
					.jGraduate(
					{
						paint: paint,
						window: { pickerTitle: title },
						images: { clientPath: curConfig.jGraduatePath },
						newstop: 'inverse'
					},
					function(p) {
						paint = new $.jGraduate.Paint(p);
						paintBox[picker].setPaint(paint);
						svgCanvas.setPaint(picker, paint);
						$('#color_picker').hide();
					},
					function() {
						$('#color_picker').hide();
					});
			};

			var PaintBox = function(container, type) {
				var paintColor, paintOpacity,
					cur = curConfig[type === 'fill' ? 'initFill' : 'initStroke'];
				// set up gradients to be used for the buttons
				var svgdocbox = new DOMParser().parseFromString(
					'<svg xmlns="http://www.w3.org/2000/svg"><rect width="16.5" height="16.5"'+
'					fill="#' + cur.color + '" opacity="' + cur.opacity + '"/>'+
'					<defs><linearGradient id="gradbox_"/></defs></svg>', 'text/xml');
				var docElem = svgdocbox.documentElement;

				docElem = $(container)[0].appendChild(document.importNode(docElem, true));
				docElem.setAttribute('width',16.5);

				this.rect = docElem.firstChild;
				this.defs = docElem.getElementsByTagName('defs')[0];
				this.grad = this.defs.firstChild;
				this.paint = new $.jGraduate.Paint({solidColor: cur.color});
				this.type = type;

				this.setPaint = function(paint, apply) {
					this.paint = paint;

					var fillAttr = 'none';
					var ptype = paint.type;
					var opac = paint.alpha / 100;

					switch ( ptype ) {
						case 'solidColor':
							fillAttr = (paint[ptype] != 'none') ? '#' + paint[ptype] : paint[ptype];
							break;
						case 'linearGradient':
						case 'radialGradient':
							this.defs.removeChild(this.grad);
							this.grad = this.defs.appendChild(paint[ptype]);
							var id = this.grad.id = 'gradbox_' + this.type;
							fillAttr = 'url(#' + id + ')';
							break;
					}

					this.rect.setAttribute('fill', fillAttr);
					this.rect.setAttribute('opacity', opac);

					if (apply) {
						svgCanvas.setColor(this.type, paintColor, true);
						svgCanvas.setPaintOpacity(this.type, paintOpacity, true);
					}
				};

				this.update = function(apply) {
					if (!selectedElement) {return;}
					var i, len;
					var type = this.type;
					switch (selectedElement.tagName) {
					case 'use':
					case 'image':
					case 'foreignObject':
						// These elements don't have fill or stroke, so don't change
						// the current value
						return;
					case 'g':
					case 'a':
						var gPaint = null;

						var childs = selectedElement.getElementsByTagName('*');
						for (i = 0, len = childs.length; i < len; i++) {
							var elem = childs[i];
							var p = elem.getAttribute(type);
							if (i === 0) {
								gPaint = p;
							} else if (gPaint !== p) {
								gPaint = null;
								break;
							}
						}

						if (gPaint === null) {
							// No common color, don't update anything
							paintColor = null;
							return;
						}
						paintColor = gPaint;
						paintOpacity = 1;
						break;
					default:
						paintOpacity = parseFloat(selectedElement.getAttribute(type + '-opacity'));
						if (isNaN(paintOpacity)) {
							paintOpacity = 1.0;
						}

						var defColor = type === 'fill' ? 'black' : 'none';
						paintColor = selectedElement.getAttribute(type) || defColor;
					}

					if (apply) {
						svgCanvas.setColor(type, paintColor, true);
						svgCanvas.setPaintOpacity(type, paintOpacity, true);
					}

					paintOpacity *= 100;

					var paint = getPaint(paintColor, paintOpacity, type);
					// update the rect inside #fill_color/#stroke_color
					this.setPaint(paint);
				};

				this.prep = function() {
					var ptype = this.paint.type;

					switch ( ptype ) {
						case 'linearGradient':
						case 'radialGradient':
							var paint = new $.jGraduate.Paint({copy: this.paint});
							svgCanvas.setPaint(type, paint);
							break;
					}
				};
			};

			paintBox.fill = new PaintBox('#fill_color', 'fill');
			paintBox.stroke = new PaintBox('#stroke_color', 'stroke');

			$('#stroke_width').val(curConfig.initStroke.width);
			$('#group_opacity').val(curConfig.initOpacity * 100);

			// Use this SVG elem to test vectorEffect support
			var testEl = paintBox.fill.rect.cloneNode(false);
			testEl.setAttribute('style', 'vector-effect:non-scaling-stroke');
			supportsNonSS = (testEl.style.vectorEffect === 'non-scaling-stroke');
			testEl.removeAttribute('style');
			var svgdocbox = paintBox.fill.rect.ownerDocument;
			// Use this to test support for blur element. Seems to work to test support in Webkit
			var blurTest = svgdocbox.createElementNS(svgedit.NS.SVG, 'feGaussianBlur');
			if (blurTest.stdDeviationX === undefined) {
				$('#tool_blur').hide();
			}
			$(blurTest).remove();

			// Test for zoom icon support
			(function() {
				var pre = '-' + uaPrefix.toLowerCase() + '-zoom-';
				var zoom = pre + 'in';
				workarea.css('cursor', zoom);
				if (workarea.css('cursor') === zoom) {
					zoomInIcon = zoom;
					zoomOutIcon = pre + 'out';
				}
				workarea.css('cursor', 'auto');
			}());

			// Test for embedImage support (use timeout to not interfere with page load)
			setTimeout(function() {
				svgCanvas.embedImage('images/logo.png', function(datauri) {
					if (!datauri) {
						// Disable option
						$('#image_save_opts [value=embed]').attr('disabled', 'disabled');
						$('#image_save_opts input').val(['ref']);
						$.pref('img_save', 'ref');
						$('#image_opt_embed').css('color', '#666').attr('title', uiStrings.notification.featNotSupported);
					}
				});
			}, 1000);

			$('#fill_color, #tool_fill .icon_label').click(function() {
				colorPicker($('#fill_color'));
				updateToolButtonState();
			});

			$('#stroke_color, #tool_stroke .icon_label').click(function() {
				colorPicker($('#stroke_color'));
				updateToolButtonState();
			});

			$('#group_opacityLabel').click(function() {
				$('#opacity_dropdown button').mousedown();
				$(window).mouseup();
			});

			$('#zoomLabel').click(function() {
				$('#zoom_dropdown button').mousedown();
				$(window).mouseup();
			});

			$('#tool_move_top').mousedown(function(evt) {
				$('#tools_stacking').show();
				evt.preventDefault();
			});

			$('.layer_button').mousedown(function() {
				$(this).addClass('layer_buttonpressed');
			}).mouseout(function() {
				$(this).removeClass('layer_buttonpressed');
			}).mouseup(function() {
				$(this).removeClass('layer_buttonpressed');
			});

			$('.push_button').mousedown(function() {
				if (!$(this).hasClass('disabled')) {
					$(this).addClass('push_button_pressed').removeClass('push_button');
				}
			}).mouseout(function() {
				$(this).removeClass('push_button_pressed').addClass('push_button');
			}).mouseup(function() {
				$(this).removeClass('push_button_pressed').addClass('push_button');
			});

			// ask for a layer name
			$('#layer_new').click(function() {
				var uniqName,
					i = svgCanvas.getCurrentDrawing().getNumLayers();
				do {
					uniqName = uiStrings.layers.layer + ' ' + (++i);
				} while(svgCanvas.getCurrentDrawing().hasLayer(uniqName));

				$.prompt(uiStrings.notification.enterUniqueLayerName, uniqName, function(newName) {
					if (!newName) {return;}
					if (svgCanvas.getCurrentDrawing().hasLayer(newName)) {
						$.alert(uiStrings.notification.dupeLayerName);
						return;
					}
					svgCanvas.createLayer(newName);
					updateContextPanel();
					populateLayers();
				});
			});

			function deleteLayer() {
				if (svgCanvas.deleteCurrentLayer()) {
					updateContextPanel();
					populateLayers();
					// This matches what SvgCanvas does
					// TODO: make this behavior less brittle (svg-editor should get which
					// layer is selected from the canvas and then select that one in the UI)
					$('#layerlist tr.layer').removeClass('layersel');
					$('#layerlist tr.layer:first').addClass('layersel');
				}
			}

			function cloneLayer() {
				var name = svgCanvas.getCurrentDrawing().getCurrentLayerName() + ' copy';

				$.prompt(uiStrings.notification.enterUniqueLayerName, name, function(newName) {
					if (!newName) {return;}
					if (svgCanvas.getCurrentDrawing().hasLayer(newName)) {
						$.alert(uiStrings.notification.dupeLayerName);
						return;
					}
					svgCanvas.cloneLayer(newName);
					updateContextPanel();
					populateLayers();
				});
			}

			function mergeLayer() {
				if ($('#layerlist tr.layersel').index() == svgCanvas.getCurrentDrawing().getNumLayers()-1) {
					return;
				}
				svgCanvas.mergeLayer();
				updateContextPanel();
				populateLayers();
			}

			function moveLayer(pos) {
				var curIndex = $('#layerlist tr.layersel').index();
				var total = svgCanvas.getCurrentDrawing().getNumLayers();
				if (curIndex > 0 || curIndex < total-1) {
					curIndex += pos;
					svgCanvas.setCurrentLayerPosition(total-curIndex-1);
					populateLayers();
				}
			}

			$('#layer_delete').click(deleteLayer);

			$('#layer_up').click(function() {
				moveLayer(-1);
			});

			$('#layer_down').click(function() {
				moveLayer(1);
			});

			$('#layer_rename').click(function() {
				// var curIndex = $('#layerlist tr.layersel').prevAll().length; // Currently unused
				var oldName = $('#layerlist tr.layersel td.layername').text();
				$.prompt(uiStrings.notification.enterNewLayerName, '', function(newName) {
					if (!newName) {return;}
					if (oldName == newName || svgCanvas.getCurrentDrawing().hasLayer(newName)) {
						$.alert(uiStrings.notification.layerHasThatName);
						return;
					}

					svgCanvas.renameCurrentLayer(newName);
					populateLayers();
				});
			});

			var SIDEPANEL_MAXWIDTH = 300;
			var SIDEPANEL_OPENWIDTH = 150;
			var sidedrag = -1, sidedragging = false, allowmove = false;

			var changeSidePanelWidth = function(delta) {
				var rulerX = $('#ruler_x');
				$('#sidepanels').width('+=' + delta);
				$('#layerpanel').width('+=' + delta);
				rulerX.css('right', parseInt(rulerX.css('right'), 10) + delta);
				workarea.css('right', parseInt(workarea.css('right'), 10) + delta);
				svgCanvas.runExtensions('workareaResized');
			};

			var resizeSidePanel = function(evt) {
				if (!allowmove) {return;}
				if (sidedrag == -1) {return;}
				sidedragging = true;
				var deltaX = sidedrag - evt.pageX;
				var sideWidth = $('#sidepanels').width();
				if (sideWidth + deltaX > SIDEPANEL_MAXWIDTH) {
					deltaX = SIDEPANEL_MAXWIDTH - sideWidth;
					sideWidth = SIDEPANEL_MAXWIDTH;
				} else if (sideWidth + deltaX < 2) {
					deltaX = 2 - sideWidth;
					sideWidth = 2;
				}
				if (deltaX == 0) {return;}
				sidedrag -= deltaX;
				changeSidePanelWidth(deltaX);
			};

			// if width is non-zero, then fully close it, otherwise fully open it
			// the optional close argument forces the side panel closed
			var toggleSidePanel = function(close) {
				var w = $('#sidepanels').width();
				var deltaX = (w > 2 || close ? 2 : SIDEPANEL_OPENWIDTH) - w;
				changeSidePanelWidth(deltaX);
			};

			$('#sidepanel_handle')
				.mousedown(function(evt) {
					sidedrag = evt.pageX;
					$(window).mousemove(resizeSidePanel);
					allowmove = false;
					// Silly hack for Chrome, which always runs mousemove right after mousedown
					setTimeout(function() {
						allowmove = true;
					}, 20);
				})
				.mouseup(function(evt) {
					if (!sidedragging) {toggleSidePanel();}
					sidedrag = -1;
					sidedragging = false;
				});

			$(window).mouseup(function() {
				sidedrag = -1;
				sidedragging = false;
				$('#svg_editor').unbind('mousemove', resizeSidePanel);
			});

			populateLayers();

			var centerCanvas = function() {
				// this centers the canvas vertically in the workarea (horizontal handled in CSS)
				workarea.css('line-height', workarea.height() + 'px');
			};

			$(window).bind('load resize', centerCanvas);

			function stepFontSize(elem, step) {
				var orig_val = Number(elem.value);
				var sug_val = orig_val + step;
				var increasing = sug_val >= orig_val;
				if (step === 0) {return orig_val;}

				if (orig_val >= 24) {
					if (increasing) {
						return Math.round(orig_val * 1.1);
					}
					return Math.round(orig_val / 1.1);
				}
				if (orig_val <= 1) {
					if (increasing) {
						return orig_val * 2;
					}
					return orig_val / 2;
				}
				return sug_val;
			}

			function stepZoom(elem, step) {
				var orig_val = Number(elem.value);
				if (orig_val === 0) {return 100;}
				var sug_val = orig_val + step;
				if (step === 0) {return orig_val;}

				if (orig_val >= 100) {
					return sug_val;
				}
				if (sug_val >= orig_val) {
					return orig_val * 2;
				}
				return orig_val / 2;
			}

			$("input:radio[name='canvas_layout']").change(function(){
				if($('#paper option:selected').val()!=='content'){
					var width = $('#canvas_width').val();
					var height = $('#canvas_height').val();
					$('#canvas_width').val(height);
					$('#canvas_height').val(width);
				}
			});

			$('#paper').change(function() {
				var layouts = $("input:radio[name='canvas_layout']");
				var wh = $('#canvas_width,#canvas_height');
				if (!this.selectedIndex) {
					if ($('#canvas_width').val() == 'fit') {
						wh.removeAttr('disabled').val(100);
					}
				} else if (this.value == 'content') {//适应内容
					var frameWidth = mapProperties.width*mapProperties.zoom+2*(rect_gap+left_gap);
					var frameheight = mapProperties.height*mapProperties.zoom+top_gap+bottom_gap+2*rect_gap;
					var cmWidth = svgedit.units.convertUnit(frameWidth,"cm");
					var cmHeight = svgedit.units.convertUnit(frameheight,"cm");
					$('#canvas_width').val(cmWidth+"cm");
					$('#canvas_height').val(cmHeight+"cm");
				} else {
					var dims = this.value.split('x');
					if(layouts[0].checked){
						$('#canvas_width').val(dims[0]);
						$('#canvas_height').val(dims[1]);
					}else{
						$('#canvas_width').val(dims[1]);
						$('#canvas_height').val(dims[0]);
					}
					wh.removeAttr('disabled');
				}
			});

			$('#scale_ratio').change(function() {
				var scale = Number(this.value);
				window.OPTIONS.scale = scale;
				var size = calcMapSize(scale);
				var width = svgedit.units.convertToNum("width",size.w+"cm");
				var height = svgedit.units.convertToNum("width",size.h+"cm");
				mapProperties.zoom = width/mapProperties.width;
			});

			//Prevent browser from erroneously repopulating fields
			$('input,select').attr('autocomplete', 'off');

			// Associate all button actions as well as non-button keyboard shortcuts
			Actions = (function() {
				// sel:'selector', fn:function, evt:'event', key:[key, preventDefault, NoDisableInInput]
				var tool_buttons = [
					{sel: '#tool_select', fn: clickSelect, evt: 'click', key: ['V', true]},
					{sel: '#tool_fhpath', fn: clickFHPath, evt: 'click', key: ['Q', true]},
					{sel: '#tool_line', fn: clickLine, evt: 'click', key: ['L', true]},
					{sel: '#tool_rect', fn: clickRect, evt: 'mouseup', key: ['R', true], parent: '#tools_rect', icon: 'rect'},
					{sel: '#tool_square', fn: clickSquare, evt: 'mouseup', parent: '#tools_rect', icon: 'square'},
					{sel: '#tool_fhrect', fn: clickFHRect, evt: 'mouseup', parent: '#tools_rect', icon: 'fh_rect'},
					{sel: '#tool_ellipse', fn: clickEllipse, evt: 'mouseup', key: ['E', true], parent: '#tools_ellipse', icon: 'ellipse'},
					{sel: '#tool_circle', fn: clickCircle, evt: 'mouseup', parent: '#tools_ellipse', icon: 'circle'},
					{sel: '#tool_fhellipse', fn: clickFHEllipse, evt: 'mouseup', parent: '#tools_ellipse', icon: 'fh_ellipse'},
					{sel: '#tool_text', fn: clickText, evt: 'click', key: ['T', true]},
					{sel: '#tool_zoom', fn: clickZoom, evt: 'mouseup', key: ['Z', true]},
					{sel: '#tool_export', fn: clickExport, evt: 'mouseup'},
					{sel: '#tool_share', fn: clickShare, evt: 'mouseup'},				
					{sel: '#tool_source', fn: showSourceEditor, evt: 'click', key: ['U', true]},
					{sel: '#tool_source_cancel,.overlay,#tool_docprops_cancel,#tool_prefs_cancel', fn: cancelOverlays, evt: 'click', key: ['esc', false, false], hidekey: true},
					{sel: '#tool_source_save', fn: saveSourceEditor, evt: 'click'},
					{sel: '#tool_docprops_save', fn: saveDocProperties, evt: 'click'},
					{sel: '#tool_docprops', fn: showDocProperties, evt: 'mouseup'},
					{sel: '#tool_prefs_save', fn: savePreferences, evt: 'click'},
					{sel: '#tool_prefs_option', fn: function() {showPreferences(); return false;}, evt: 'mouseup'},
					{sel: '#tool_undo', fn: clickUndo, evt: 'click'},
					{sel: '#tool_redo', fn: clickRedo, evt: 'click'},
					{sel: '#tool_group_elements', fn: clickGroup, evt: 'click', key: ['G', true]},
					{sel: '#tool_ungroup', fn: clickGroup, evt: 'click'},
					{sel: '#tool_bold', fn: clickBold, evt: 'mousedown'},
					{sel: '#tool_italic', fn: clickItalic, evt: 'mousedown'},
					{sel: '#sidepanel_handle', fn: toggleSidePanel, key: ['X']},
					// Shortcuts not associated with buttons

					{key: 'ctrl+left', fn: function(){rotateSelected(0,1);}},
					{key: 'ctrl+right', fn: function(){rotateSelected(1,1);}},
					{key: 'ctrl+shift+left', fn: function(){rotateSelected(0,5);}},
					{key: 'ctrl+shift+right', fn: function(){rotateSelected(1,5);}},
					{key: 'shift+O', fn: selectPrev},
					{key: 'shift+P', fn: selectNext},
					{key: [modKey+'up', true], fn: function(){zoomImage(2);}},
					{key: [modKey+'down', true], fn: function(){zoomImage(0.5);}},
					{key: [modKey+']', true], fn: function(){moveUpDownSelected('Up');}},
					{key: [modKey+'[', true], fn: function(){moveUpDownSelected('Down');}},
					{key: ['up', true], fn: function(){moveSelected(0,-1);}},
					{key: ['down', true], fn: function(){moveSelected(0,1);}},
					{key: ['left', true], fn: function(){moveSelected(-1,0);}},
					{key: ['right', true], fn: function(){moveSelected(1,0);}},
					{key: 'shift+up', fn: function(){moveSelected(0,-10);}},
					{key: 'shift+down', fn: function(){moveSelected(0,10);}},
					{key: 'shift+left', fn: function(){moveSelected(-10,0);}},
					{key: 'shift+right', fn: function(){moveSelected(10,0);}},
					{key: ['alt+up', true], fn: function(){svgCanvas.cloneSelectedElements(0,-1);}},
					{key: ['alt+down', true], fn: function(){svgCanvas.cloneSelectedElements(0,1);}},
					{key: ['alt+left', true], fn: function(){svgCanvas.cloneSelectedElements(-1,0);}},
					{key: ['alt+right', true], fn: function(){svgCanvas.cloneSelectedElements(1,0);}},
					{key: ['alt+shift+up', true], fn: function(){svgCanvas.cloneSelectedElements(0,-10);}},
					{key: ['alt+shift+down', true], fn: function(){svgCanvas.cloneSelectedElements(0,10);}},
					{key: ['alt+shift+left', true], fn: function(){svgCanvas.cloneSelectedElements(-10,0);}},
					{key: ['alt+shift+right', true], fn: function(){svgCanvas.cloneSelectedElements(10,0);}},
					{key: 'A', fn: function(){svgCanvas.selectAllInCurrentLayer();}},

					// Standard shortcuts
					{key: modKey+'z', fn: clickUndo},
					{key: modKey + 'shift+z', fn: clickRedo},
					{key: modKey + 'y', fn: clickRedo},

					{key: modKey+'x', fn: cutSelected},
					{key: modKey+'c', fn: copySelected},
					{key: modKey+'v', fn: pasteInCenter}
				];

				// Tooltips not directly associated with a single function
				var key_assocs = {
					'4/Shift+4': '#tools_rect_show',
					'5/Shift+5': '#tools_ellipse_show'
				};

				return {
					setAll: function() {
						var flyouts = {};

						$.each(tool_buttons, function(i, opts) {
							// Bind function to button
							var btn;
							if (opts.sel) {
								btn = $(opts.sel);
								if (btn.length == 0) {return true;} // Skip if markup does not exist
								if (opts.evt) {
									if (svgedit.browser.isTouch() && opts.evt === 'click') {
										opts.evt = 'mousedown';
									}
									btn[opts.evt](opts.fn);
								}

								// Add to parent flyout menu, if able to be displayed
								if (opts.parent && $(opts.parent + '_show').length != 0) {
									var f_h = $(opts.parent);
									if (!f_h.length) {
										f_h = makeFlyoutHolder(opts.parent.substr(1));
									}

									f_h.append(btn);

									if (!$.isArray(flyouts[opts.parent])) {
										flyouts[opts.parent] = [];
									}
									flyouts[opts.parent].push(opts);
								}
							}

							// Bind function to shortcut key
							if (opts.key) {
								// Set shortcut based on options
								var keyval, disInInp = true, fn = opts.fn, pd = false;
								if ($.isArray(opts.key)) {
									keyval = opts.key[0];
									if (opts.key.length > 1) {pd = opts.key[1];}
									if (opts.key.length > 2) {disInInp = opts.key[2];}
								} else {
									keyval = opts.key;
								}
								keyval += '';

								$.each(keyval.split('/'), function(i, key) {
									$(document).bind('keydown', key, function(e) {
										fn();
										if (pd) {
											e.preventDefault();
										}
										// Prevent default on ALL keys?
										return false;
									});
								});

								// Put shortcut in title
								if (opts.sel && !opts.hidekey && btn.attr('title')) {
									var newTitle = btn.attr('title').split('[')[0] + ' (' + keyval + ')';
									key_assocs[keyval] = opts.sel;
									// Disregard for menu items
									if (!btn.parents('#main_menu').length) {
										btn.attr('title', newTitle);
									}
								}
							}
						});

						// Setup flyouts
						setupFlyouts(flyouts);

						$(window).bind('keydown', 'tab', function(e) {
							if (ui_context === 'canvas') {
								e.preventDefault();
								selectNext();
							}
						}).bind('keydown', 'shift+tab', function(e) {
							if (ui_context === 'canvas') {
								e.preventDefault();
								selectPrev();
							}
						});

						$('#tool_zoom').dblclick(dblclickZoom);
					},
					setTitles: function() {
						$.each(key_assocs, function(keyval, sel) {
							var menu = ($(sel).parents('#main_menu').length);

							$(sel).each(function() {
								var t;
								if (menu) {
									t = $(this).text().split(' [')[0];
								} else {
									t = this.title.split(' [')[0];
								}
								var key_str = '';
								// Shift+Up
								$.each(keyval.split('/'), function(i, key) {
									var mod_bits = key.split('+'), mod = '';
									if (mod_bits.length > 1) {
										mod = mod_bits[0] + '+';
										key = mod_bits[1];
									}
									key_str += (i?'/':'') + mod + (uiStrings['key_'+key] || key);
								});
								if (menu) {
									this.lastChild.textContent = t +' ['+key_str+']';
								} else {
									this.title = t +' ['+key_str+']';
								}
							});
						});
					},
					getButtonData: function(sel) {
						var b;
						$.each(tool_buttons, function(i, btn) {
							if (btn.sel === sel) {b = btn;}
						});
						return b;
					}
				};
			}());

			Actions.setAll();

			// Select given tool
			editor.ready(function() {
				var tool,
					itool = curConfig.initTool,
					container = $('#tools_left, #svg_editor .tools_flyout'),
					pre_tool = container.find('#tool_' + itool),
					reg_tool = container.find('#' + itool);
				if (pre_tool.length) {
					tool = pre_tool;
				} else if (reg_tool.length) {
					tool = reg_tool;
				} else {
					tool = $('#tool_select');
				}
				tool.click().mouseup();

				if (curConfig.showlayers) {
					toggleSidePanel();
				}

				$('#rulers').toggle(!!curConfig.showRulers);

				if (curConfig.showRulers) {
					$('#show_rulers')[0].checked = true;
				}

				if (curConfig.baseUnit) {
					$('#base_unit').val(curConfig.baseUnit);
				}
			});

			// init SpinButtons
			$('#rect_rx').SpinButton({ min: 0, max: 1000, callback: changeRectRadius });
			$('#stroke_width').SpinButton({ min: 0, max: 99, smallStep: 0.1, callback: changeStrokeWidth });
			$('#angle').SpinButton({ min: -180, max: 180, step: 5, callback: changeRotationAngle });
			$('#font_size').SpinButton({ min: 0.001, stepfunc: stepFontSize, callback: changeFontSize });
			$('#group_opacity').SpinButton({ min: 0, max: 100, step: 5, callback: changeOpacity });
			$('#blur').SpinButton({ min: 0, max: 10, step: 0.1, callback: changeBlur });
			$('#zoom').SpinButton({ min: 0.001, max: 10000, step: 50, stepfunc: stepZoom, callback: changeZoom })
				// Set default zoom
				.val(svgCanvas.getZoom() * 100);

			$('#workarea').contextMenu({
					menu: 'cmenu_canvas',
					inSpeed: 0
				},
				function(action, el, pos) {
					switch (action) {
						case 'delete':
							deleteSelected();
							break;
						case 'cut':
							cutSelected();
							break;
						case 'copy':
							copySelected();
							break;
						case 'paste':
							svgCanvas.pasteElements();
							break;
						case 'paste_in_place':
							svgCanvas.pasteElements('in_place');
							break;
						case 'group':
						case 'group_elements':
							svgCanvas.groupSelectedElements();
							break;
						case 'ungroup':
							svgCanvas.ungroupSelectedElement();
							break;
						case 'move_front':
							moveToTopSelected();
							break;
						case 'move_up':
							moveUpDownSelected('Up');
							break;
						case 'move_down':
							moveUpDownSelected('Down');
							break;
						case 'move_back':
							moveToBottomSelected();
							break;
						default:
							if (svgedit.contextmenu && svgedit.contextmenu.hasCustomHandler(action)) {
								svgedit.contextmenu.getCustomHandler(action).call();
							}
							break;
					}
					if (svgCanvas.clipBoard.length) {
						canv_menu.enableContextMenuItems('#paste,#paste_in_place');
					}
				}
			);

			var lmenu_func = function(action, el, pos) {
				switch ( action ) {
					case 'dupe':
						cloneLayer();
						break;
					case 'delete':
						deleteLayer();
						break;
					case 'merge_down':
						mergeLayer();
						break;
					case 'merge_all':
						svgCanvas.mergeAllLayers();
						updateContextPanel();
						populateLayers();
						break;
				}
			};

			$('#layerlist').contextMenu({
					menu: 'cmenu_layers',
					inSpeed: 0
				},
				lmenu_func
			);

			$('#layer_moreopts').contextMenu({
					menu: 'cmenu_layers',
					inSpeed: 0,
					allowLeft: true
				},
				lmenu_func
			);

			$('.contextMenu li').mousedown(function(ev) {
				ev.preventDefault();
			});

			$('#cmenu_canvas li').disableContextMenu();
			canv_menu.enableContextMenuItems('#delete,#cut,#copy');

			window.addEventListener('beforeunload', function(e) {
				// Suppress warning if page is empty
				if (undoMgr.getUndoStackSize() === 0) {
					editor.showSaveWarning = false;
				}

				// showSaveWarning is set to 'false' when the page is saved.
				if (!curConfig.no_save_warning && editor.showSaveWarning) {
					// Browser already asks question about closing the page
					e.returnValue = uiStrings.notification.unsavedChanges; // Firefox needs this when beforeunload set by addEventListener (even though message is not used)
					return uiStrings.notification.unsavedChanges;
				}
			}, false);

			editor.openPrep = function(func) {
				$('#main_menu').hide();
				if (undoMgr.getUndoStackSize() === 0) {
					func(true);
				} else {
					$.confirm(uiStrings.notification.QwantToOpen, func);
				}
			};

			function onDragEnter(e) {
				e.stopPropagation();
				e.preventDefault();
				// and indicator should be displayed here, such as "drop files here"
			}

			function onDragOver(e) {
				e.stopPropagation();
				e.preventDefault();
			}

			function onDragLeave(e) {
				e.stopPropagation();
				e.preventDefault();
				// hypothetical indicator should be removed here
			}
			// Use HTML5 File API: http://www.w3.org/TR/FileAPI/
			// if browser has HTML5 File API support, then we will show the open menu item
			// and provide a file input to click. When that change event fires, it will
			// get the text contents of the file and send it to the canvas
			if (window.FileReader) {
				var importImage = function(e) {
					$.process_cancel(uiStrings.notification.loadingImage);
					e.stopPropagation();
					e.preventDefault();
					$('#workarea').removeAttr('style');
					$('#main_menu').hide();
					var file = (e.type == 'drop') ? e.dataTransfer.files[0] : this.files[0];
					if (!file) {
						$('#dialog_box').hide();
						return;
					}
					if (file.type.indexOf('image') != -1) {
						// Detected an image
						// svg handling
						var reader;
						if (file.type.indexOf('svg') != -1) {
							reader = new FileReader();
							reader.onloadend = function(e) {
								var newElement = svgCanvas.importSvgString(e.target.result, true);
								svgCanvas.ungroupSelectedElement();
								svgCanvas.ungroupSelectedElement();
								svgCanvas.groupSelectedElements();
								svgCanvas.alignSelectedElements('m', 'page');
								svgCanvas.alignSelectedElements('c', 'page');
								// highlight imported element, otherwise we get strange empty selectbox
								svgCanvas.selectOnly([newElement]);
								$('#dialog_box').hide();
							};
							reader.readAsText(file);
						}
						else {
						//bitmap handling
							reader = new FileReader();
							reader.onloadend = function(e) {
								// let's insert the new image until we know its dimensions
								var insertNewImage = function(width, height) {
									var newImage = svgCanvas.addSvgElementFromJson({
										element: 'image',
										attr: {
											x: 0,
											y: 0,
											width: width,
											height: height,
											id: svgCanvas.getNextId(),
											style: 'pointer-events:inherit'
										}
									});
									svgCanvas.setHref(newImage, e.target.result);
									svgCanvas.selectOnly([newImage]);
									svgCanvas.alignSelectedElements('m', 'page');
									svgCanvas.alignSelectedElements('c', 'page');
									updateContextPanel();
									$('#dialog_box').hide();
								};
								// create dummy img so we know the default dimensions
								var imgWidth = 100;
								var imgHeight = 100;
								var img = new Image();
								img.src = e.target.result;
								img.style.opacity = 0;
								img.onload = function() {
									imgWidth = img.offsetWidth;
									imgHeight = img.offsetHeight;
									insertNewImage(imgWidth, imgHeight);
								};
							};
							reader.readAsDataURL(file);
						}
					}
				};

				workarea[0].addEventListener('dragenter', onDragEnter, false);
				workarea[0].addEventListener('dragover', onDragOver, false);
				workarea[0].addEventListener('dragleave', onDragLeave, false);
				workarea[0].addEventListener('drop', importImage, false);

				var open = $('<input type="file">').change(function() {
					var f = this;
					editor.openPrep(function(ok) {
						if (!ok) {return;}
						svgCanvas.clear();
						if (f.files.length === 1) {
							$.process_cancel(uiStrings.notification.loadingImage);
							var reader = new FileReader();
							reader.onloadend = function(e) {
								loadSvgString(e.target.result);
								updateCanvas();
							};
							reader.readAsText(f.files[0]);
						}
					});
				});
				$('#tool_open').show().prepend(open);

				var imgImport = $('<input type="file">').change(importImage);
				$('#tool_import').show().prepend(imgImport);
			}

			updateCanvas(true);

			// For Compatibility with older extensions
			$(function() {
				window.svgCanvas = svgCanvas;
				svgCanvas.ready = editor.ready;
			});
		};

		editor.ready = function (cb) {
			if (!isReady) {
				callbacks.push(cb);
			} else {
				cb();
			}
		};

		editor.runCallbacks = function () {
			$.each(callbacks, function() {
				this();
			});
			isReady = true;
		};

		function createPrintMap(style,scale,callback) {
		    var options = window.options;
		    if(options.width>MAX_SIZE||options.height>MAX_SIZE){
		    	$.alert(uiStrings.notification.invalidMapSize);
		    }

		    // Calculate pixel ratio
		    var actualPixelRatio = window.devicePixelRatio;
		    Object.defineProperty(window, 'devicePixelRatio', {
		        get: function() {return scale}
		    });

		    // Create map container
		    var hidden = document.createElement('div');
		    hidden.className = 'hidden-map';
		    document.body.appendChild(hidden);
		    var container = document.createElement('div');
		    container.style.width = options.width+'px';
		    container.style.height = options.height+'px';
		    hidden.appendChild(container);

		    // Render map
		    mapboxgl.accessToken = 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpbG10dnA3NzY3OTZ0dmtwejN2ZnUycjYifQ.1W5oTOnWXQ9R1w8u3Oo1yA';
		    var renderMap = new mapboxgl.Map({
		        container: container,
		        center: options.center,
		        zoom: options.zoom,
		        style: style,
		        interactive: false,
		        attributionControl: false
		    });
		    renderMap.once('load', function() {
	            renderMap.getCanvas().toBlob(function(blob) {
	                callback(blob);
	            });

		        renderMap.remove();
		        hidden.parentNode.removeChild(hidden);
		        Object.defineProperty(window, 'devicePixelRatio', {
		            get: function() {return actualPixelRatio}
		        });
		    });
		}

		editor.loadFromString = function (str,url) {
			var options = window.OPTIONS;
			if(options){
				var xmlObj = $.parseXML(str);//xml对象
				var xmlString;//xml字符串	
				var map_outside = $(xmlObj).find('#map_outside');
				var map_inside = $(xmlObj).find('#map_inside');
				right_gap = left_gap = parseFloat(map_outside.attr("x"));
				top_gap = parseFloat(map_outside.attr("y"));
				rect_gap = parseFloat(map_inside.attr("x"))-left_gap;
				var image = $(xmlObj).find("image");
				image.attr("xlink:href",url);//替换url	  
				if (window.ActiveXObject){//code for ie
				    xmlString = xmlObj.xml;
				}else{// code for Mozilla, Firefox, Opera, etc.
				    xmlString = (new XMLSerializer()).serializeToString(xmlObj);
				}
				editor.ready(function() {
					loadSvgString(xmlString,xmlStringLoaded);
				});   
			}else{
				var xmlString = str;
				editor.ready(function() {
					loadSvgString(xmlString);
				});
				
			}

			function xmlStringLoaded(flag){
				if(flag===false){return;}
				var img = new Image();	// 创建对象		  		
				img.src = url;	// 改变图片的src		  
				img.onload = function(){// 加载完成执行
					mapProperties.width = this.width;
					mapProperties.height = this.height;
					var w = this.width+2*(rect_gap+left_gap);
					var h = this.height+top_gap+bottom_gap+2*rect_gap;

					if (w != 'fit' && !svgedit.units.isValidUnit('width', w)) {
						$.alert(uiStrings.notification.invalidAttrValGiven);
						return false;
					}

					if (h != 'fit' && !svgedit.units.isValidUnit('height', h)) {
						$.alert(uiStrings.notification.invalidAttrValGiven);
						return false;
					}

					if (!svgCanvas.setResolution(w, h)) {
						$.alert(uiStrings.notification.noContentToFitTo);
						return false;
					}

					editor.updateCanvas();
					svgCanvas.zoomChanged(window,"100%");//设置100%画布缩放
					if(window.OPTIONS.selectedDistrict!==""){
						var templateName = window.OPTIONS.templateName;
						var title = window.OPTIONS.selectedDistrict+templateName;
						changeSVGTemple(this.width,this.height,title);
					}else{
						changeSVGTemple(this.width,this.height);
					}
					document.getElementById('mapImg').setAttribute("width",this.width);
					document.getElementById('mapImg').setAttribute("height",this.height);
					document.getElementById('background').setAttribute("width",w);
					document.getElementById('background').setAttribute("height",h);
					var date = new Date();
					document.getElementById('mapping_time').innerHTML = date.getFullYear() + "年" + (date.getMonth()+1) +"月";
					document.getElementById('mapping_organization').innerHTML = options.organization;
					//计算比例尺
					var merc = new SphericalMercator({
						size:256
					});
					var bbox = window.OPTIONS.bbox;
					var ws = merc.forward([bbox[0],bbox[1]]);
					var es = merc.forward([bbox[2],bbox[1]]);
					var wn = merc.forward([bbox[0],bbox[3]]);
					var realWidth = Math.abs(es[0]-ws[0])*100;
					var cmWidth = svgedit.units.convertUnit(this.width,"cm");
					var scale = parseInt(realWidth/cmWidth);
					window.OPTIONS.scale = mapProperties.scale = scale;
					$("#scale_ratio").val(scale);
				};
			}
			
		};

		editor.loadFromURL = function (url, opts) {
			if (!opts) {opts = {};}

			var cache = opts.cache;
			var cb = opts.callback;

			editor.ready(function() {
				$.ajax({
					'url': url,
					'dataType': 'text',
					cache: !!cache,
					beforeSend:function(){
						$.process_cancel(uiStrings.notification.loadingImage);
					},
					success: function(str) {
						loadSvgString(str, cb);
					},
					error: function(xhr, stat, err) {
						if (xhr.status != 404 && xhr.responseText) {
							loadSvgString(xhr.responseText, cb);
						} else {
							$.alert(uiStrings.notification.URLloadFail + ': \n' + err, cb);
						}
					},
					complete:function(){
						$('#dialog_box').hide();
					}
				});
			});
		};

		editor.loadFromDataURI = function(str) {
			editor.ready(function() {
				var base64 = false;
				var pre = str.match(/^data:image\/svg\+xml;base64,/);
				if (pre) {
					base64 = true;
				}
				else {
					pre = str.match(/^data:image\/svg\+xml(?:;(?:utf8)?)?,/);
				}
				if (pre) {
					pre = pre[0];
				}
				var src = str.slice(pre.length);
				loadSvgString(base64 ? Utils.decode64(src) : decodeURIComponent(src));
			});
		};

		editor.addExtension = function () {
			var args = arguments;

			// Note that we don't want this on editor.ready since some extensions
			// may want to run before then (like server_opensave).
			$(function() {
				if (svgCanvas) {svgCanvas.addExtension.apply(this, args);}
			});
		};

		return editor;
	}(jQuery));

	// Run init once DOM is loaded
	$(svgEditor.init);

}());