<template>
<div>
  <mdl-snackbar display-on="mailSent"></mdl-snackbar>
  
  <div id="edit-wrap">
    <div class="header-top">
      <div class="header">
        <div class="base-title">
          <span>辅助决策用图服务系统</span>
          <span>|在线制图编辑</span>
        </div>
        <div class="contact-us" id="map-header-contact">
          <a href="javascript:void(0);">关于我们 </a>|
          <a href="javascript:void(0);">意见反馈 </a>|
          <a href="javascript:void(0);">联系我们 </a>|
          <a href="/static/document/用户手册.doc">帮助</a>
        </div>
      </div>
    </div>
    <nav class="mdl-navigation" id="main-control">
      <img class="mdl-layout-icon" src="../assets/logo.png"></img>
      <a class="mdl-navigation__link control-active" v-on:click.stop.prevent="layerControlClick" title="样式配置"><i class="material-icons">build</i></a>
      <a class="mdl-navigation__link" v-on:click.stop.prevent="districtControlClick" title="行政区划"><i class="material-icons">extension</i></a>
      <a class="mdl-navigation__link" v-on:click.prevent="styleEditorClick" title="样式源码"><i class="material-icons">code</i></a>
      <a class="mdl-navigation__link" id="svgeditor-open" v-on:click.prevent="SVGEditorClick" title="打开SVG编辑器"><i class="material-icons">open_with</i></a>
      <a class="back btm" v-on:click.prevent="backToProject" title="返回工程列表"><i class="material-icons">reply</i></br>返回</a>
      <a class="save-style btm" v-on:click.prevent="styleSaveClick" title="保存样式"><i class="material-icons">save</i></br>保存</a>
    </nav>
    <foxgis-district-select id="district-control"></foxgis-district-select>
    <foxgis-style-editor id="style-editor"></foxgis-style-editor>
    <foxgis-svgeditor id="svg-editor"></foxgis-svgeditor>
    <foxgis-toc id="toc-container" :style-obj='styleObj' v-on:hide-mapbounds="hideBoundsBox"></foxgis-toc>
    <div id="map-tool">
      <button v-on:click="backEditor" style="background-color:#888888;" disabled="true" id="back-button">取消</button>
      <button v-on:click="printMap" style="background-color:#4969CE;" id="print-button">输出</button>
    </div>
    <foxgis-satelite v-on:current-layer-change='setTocLayer' v-ref:drafmap v-if="mapType==='satelite'"></foxgis-satelite>
    <foxgis-drafmap v-on:current-layer-change='setTocLayer' v-ref:drafmap v-else></foxgis-drafmap>
    <foxgis-mapdata-view id="mapdata-view"></foxgis-mapdata-view>
    <foxgis-dialog-prompt id="delete-dialog" class='modal' :dialog="dialogcontent" v-on:dialog-action="saveAction"></foxgis-dialog-prompt>
    <foxgis-dialog-single id="layout-zoom" @dialog-action="printAction" :dialog="dialogcontent"></foxgis-dialog-single>
  </div>
</div>
</template>

<script>
/*import mapboxgl from 'mapbox-gl'*/
import Cookies from 'js-cookie'
import { diff, validate} from 'mapbox-gl-style-spec'
import { changeStyle } from '../vuex/actions'
import util from '../components/util.js'
export default {
  vuex: {
    getters: {
      style: state => state.map.style
    },
    actions: {
      changeStyle
    }
  },
  methods: {
    //图层控制
    'layerControlClick': function(e){
      this.changeControlStyle(e,'layer');
    },
    //行政区按钮 click
    'districtControlClick': function(e){
      this.$broadcast("main-control-click");
      this.changeControlStyle(e,'district');
    },
    //svg编辑器点击事件
    'SVGEditorClick': function(e){
      this.$broadcast("main-control-click");
      this.changeControlStyle(e,'svg-editor');
    },
    //style 编辑
    'styleEditorClick': function(e){
      this.$broadcast("main-control-click");
      if(e.currentTarget.className.indexOf('control-active')!==-1){
        return;
      }
      e.currentTarget.className += ' control-active';
      var active = document.getElementsByClassName("control-active");
      if(active.length === 2){
        if(active[1].textContent === "code"){
          active[0].className = active[0].className.replace(' control-active','');
        }else{
          active[1].className = active[1].className.replace(' control-active','');
        }
      }
      
      //切换toc区域的内容
      this.changeControlStyle(e,'style');
      // 传入style 字符串到textarea
      this.$broadcast('editor-init',this.style);

      document.getElementById("map-tool").style.display = 'none';
    },
    changeControlStyle:function(e,type){
      if(type === 'svg-editor'){
        if(document.getElementById("svgeditor-open").className.indexOf('control-active')!==-1){
          return;
        }
      }else if(type === 'layer' || type === 'district'){
        if(e.currentTarget.className.indexOf('control-active')!==-1){
          return;
        }
      }

      document.getElementById('toc-container').style.display = 'none';
      document.getElementById('district-control').style.display = 'none';
      document.getElementById('style-editor').style.display = 'none';
      document.getElementById('svg-editor').style.display = 'none';

      if(type === 'svg-editor'){
        document.getElementById('svg-editor').style.display = 'block';
        this.$broadcast("loadIframe");
        document.getElementById("map-editorview-container").style.visibility = 'hidden';
        this.changeLayout();
        document.getElementById("map-tool").style.display = 'none';
        document.getElementById("svgeditor-open").className += ' control-active';
      }else if(type === 'layer' || type === 'district'){
        if(type === 'layer'){
          document.getElementById('toc-container').style.display = 'block';
        }
        if(type === 'district'){
          document.getElementById('district-control').style.display = 'block';
        }
        document.getElementById("map-editorview-container").style.visibility = 'visible';
        this.changeLayout();
        e.currentTarget.className += ' control-active';
      }else if(type === 'style'){
        document.getElementById('style-editor').style.display = 'block';
        document.getElementById("map-editorview-container").style.visibility = 'visible';
      };

    },
    //保存样式方法
    'styleSaveClick':function(){
      this.patchStyle(this.style);
    },
    //返回工程列表方法
    backToProject:function(){
      this.$broadcast("main-control-click");
      if(this.styleSaveStatus===false){
        this.dialogcontent.title="存在未保存的改动，是否保存？";
        $("#delete-dialog").show();
      }else{
        this.saveAction('cancel');
      }
    },
    saveAction:function(statas){
      if(statas==='ok'){
        this.patchStyle(this.style);
      }
      var style = {};
      this.styleSaveStatus = true;
      this.changeStyle(style);
      $("#property-panel").hide();
      this.$broadcast("mapEditor-close");  
    },
    changeLayout: function(){
      var active = document.getElementsByClassName("control-active");
      active[0].className = active[0].className.replace(' control-active','');
      var mapContainer = document.getElementById("map-editorview-container");
      //之前改变过map时，还原map
      if(mapContainer.style.left === "380px"){
        mapContainer.style.width = mapContainer.getBoundingClientRect().width + 150 + "px";
        mapContainer.style.left = "230px";
      }
      document.getElementById("map-tool").style.display = 'flex';
    },
    //改变当前图层
    'setTocLayer': function(layerId){
      this.$broadcast('toc-layer-change',layerId);
    },
    printMap: function(e){  
      if(e.target.textContent === '输出'){
        this.$emit("map-view-change","hide");
        $("#property-panel").hide();
        if(this.selectedDistrictBounds.length!=0){
          var bounds = {
            nw:new mapboxgl.LngLat(this.selectedDistrictBounds[0][0],this.selectedDistrictBounds[1][1]),
            se:new mapboxgl.LngLat(this.selectedDistrictBounds[1][0],this.selectedDistrictBounds[0][1])
          }
          this.$broadcast('show-bounds-box',bounds);
        }else{
          this.$broadcast('show-bounds-box');
        } 
        e.target.innerHTML = '确定';
        document.getElementById("back-button").disabled = false;
        document.getElementById("back-button").style.background = '#2061c6'; 
        document.getElementById("back-button").style.display = 'block';
      }else if(e.target.textContent === '确定'){
        var map = this.$refs.drafmap.map;
        var zoom = map.getZoom();
        var center = map.getCenter();
        var bearing = map.getBearing();
        var pitch = map.getPitch();
        var controlBound = this.$refs.drafmap.controlBound;
        var nw = map.project(controlBound.nw);
        var se = map.project(controlBound.se);
        var width = parseInt(se.x-nw.x);
        var height = parseInt(se.y-nw.y);
        this.printAction({status:'ok',zoom:zoom,center:center,width:width,height:height,bearing:bearing,pitch:pitch})
        /*this.dialogcontent.title="输出级别";
        this.dialogcontent.type="zoom";
        var currZoom = parseInt(this.$refs.drafmap.map.getZoom());
        this.dialogcontent.value = currZoom;
        $("#layout-zoom").show();*/

      }
    },
    printAction:function(params){
      if(params.status==="cancel"){
        return;
      }
      /*var zoom = Number(params.value);
      if(isNaN(zoom)||zoom===0){
        this.$broadcast("mailSent",{message:"输入错误，请重新输入",timeout:3000});
        return;
      }*/
      var controlBound = this.$refs.drafmap.controlBound;
      var options = {
        API:SERVER_API,
        style_id:this.styleId,
        username:Cookies.get('username'),
        access_token:Cookies.get('access_token'),
        zoom:params.zoom,
        center:params.center,
        width:params.width,
        height:params.height,
        bearing:params.bearing,
        pitch:params.pitch,
        scale:1,
        selectedDistrict:this.selectedDistrict,
        templateName:this.style.metadata?(this.style.metadata.template?this.style.metadata.template.type||"地图":"地图"):"地图",
        bbox:'['+controlBound.nw.lng+','+controlBound.se.lat+','+controlBound.se.lng+','+controlBound.nw.lat+']',
        organization:Cookies.get('organization'),
        location:Cookies.get('location')
      };
      this.$broadcast('map-layout',options);
      this.SVGEditorClick();
      this.patchStyle(this.style);
      this.hideBoundsBox();
      document.getElementById("print-button").innerHTML = "输出";
      document.getElementById("back-button").disabled = true;
      document.getElementById("back-button").style.background = '#888888';
      document.getElementById("back-button").style.display = 'block';
      $("#layout-zoom").hide();
    },
    backEditor: function(e){
      var operator = document.getElementById("print-button");
      if(operator.innerText === '确定'){
        // return to editor
        this.hideBoundsBox();
        operator.innerHTML = "输出";
        document.getElementById("back-button").disabled = true;
        document.getElementById("back-button").style.background = '#888888';    
      }
    },
    hideBoundsBox: function(e){
      this.$broadcast('hide-bounds-box');
      var printbutton = document.querySelector("#print-button");
      printbutton.innerText = '输出';
    },
    patchStyle: function(style){
      this.styleSaveStatus = true;
      this.$broadcast("style-save",style);
    }
  },
  attached: function(){
    var urlhash = window.location.hash.split("?")[0];
    var styleId = urlhash.replace(/.*mapeditor\/(\w*)/,'$1');
    this.styleId = styleId;
    var params = window.location.href.split("?")[1].split("&");
    for(var i = 0;i<params.length;i++){
      if(params[i].split("=")[0]==="type"){
        this.mapType = params[i].split("=")[1];
        break;
      }
    }
    var username = Cookies.get('username');
    if(username === undefined){
      window.location.href = "#!/login";
    }
    this.styleSaveStatus = true;
    var access_token = Cookies.get('access_token');
    if(styleId !== null && access_token !== undefined){
      this.drawLayers = [];
      this.drawSource = {};
      var url = SERVER_API.styles + '/' + username + '/' + styleId;
      this.$http({url:url,method:'GET',headers:{'x-access-token':access_token}})
      .then(function(res){//从服务器获取地图的stylejson样式
        let data = res.data
        let initStyle = JSON.parse(JSON.stringify(data));
        if(initStyle.sources['mapbox-gl-draw-cold']){
          this.drawSource = initStyle.sources['mapbox-gl-draw-cold'].data;
          delete initStyle.sources['mapbox-gl-draw-cold'];
          delete initStyle.sources['mapbox-gl-draw-hot'];
        }
        for(let j=0;j<initStyle.layers.length;j++){
          if(initStyle.layers[j].source==='mapbox-gl-draw-cold'||initStyle.layers[j].source==='mapbox-gl-draw-hot'){
            this.drawLayers.push(initStyle.layers[j]);
            initStyle.layers.splice(j,1);
            j--;
          }
        }
        var tocdata = initStyle;
        this.$broadcast('toc-init', tocdata);
        this.$broadcast('style-load', {drawSource:this.drawSource,drawLayers:this.drawLayers});
        this.changeStyle(initStyle)
      },function(){
        this.$broadcast('mailSent', { message: '样式信息错误！',timeout:3000 });
      })
    }else{
      this.$broadcast('mailSent', { message: '地图样式获取失败！',timeout:3000 });
    }

    $(".mdl-navigation a")[0].click();//默认第一次进来显示地图编辑界面
  },
  data: function(){
    return {
      layers: [],
      currentLayer:{},
      selectedDistrict:"",
      selectedDistrictBounds:[],
      styleId: null,
      styleSaveStatus:true,
      dialogcontent: {
        title: '存在未保存的改动，是否保存？',
        textOk:'保存',
        textCancel:'不保存',
        type:"",
        value:""
      },
      drawSource:{},
      drawLayers:[],
      mapType:""//地图类型，标记是否为“影像地图”
    }
  },
  events: {
    'map-bounds-change': function(options){
      this.selectedDistrict = options.name;
      this.selectedDistrictBounds = options.bounds;
      this.$broadcast('map-bounds-change',options);
    },
    "map-view-change":function(action){
      if(action==="hide"){
        document.getElementById("map-dataview-container").style.visibility="hidden";
        return;
      }
      var center = this.style.center;
      var zoom = this.style.zoom;
      var params = {action:action,center:center,zoom:zoom}
      if(params.action==="show"){
        document.getElementById("map-dataview-container").style.visibility="visible";
        this.$broadcast("datamap-init",params);
      } 
    }
  },
  watch:{
    style: {
      handler:function(style,oldStyle){
        if(Object.keys(oldStyle).length===0){return}
        var comds = diff(oldStyle,style);
        if(comds.length>0&&Object.keys(oldStyle).length>0){
          this.styleSaveStatus = false;
        }
      }
    }
  }
}
</script>

<style scoped>
.header-top{
  background-color: #1f57a2;
  height: 25px;
  overflow: hidden;
}

.header-top .header{
  height: 100%;
  margin:0 auto;
  background-image: url("../../static/images/header.jpg");
  background-repeat: no-repeat;
  background-position: -65px -10px;
  position:relative;
  min-width: 1000px;
}
.base-title{
  float: left;
  margin-left: 250px;
}
.base-title span:first-child{
  color: white;
  font-size: 20px;
}
.base-title span:last-child{
  color: #b1b1b1;
  font-family: SimHei;
}
.contact-us{
  position: absolute;
  color: #b1b1b1;
  right: 200px;
}

.contact-us a{
  color: #b1b1b1;
  text-decoration: none;
  font-size: 14px;
}

#main-control .btm{
  text-align: center;
  padding: 20px 0;
  font-size: 12px;
  position: absolute;
  cursor: pointer;
}

#main-control .save-style{
  bottom: 0px;
}
#main-control .back{
  bottom: 80px;
}
.btm:hover{
  background-color: #1c7dc2;
}

#edit-wrap {
  display: flex;
  height: 100%;
  flex-direction: column;
}

#main-control {
  width: 30px;
  flex-direction: column;
  height: calc(100% - 25px);
  box-sizing: border-box;
  position: absolute;
  top: 25px;
  background-color: #18517e;
}

#main-control img {
  width: 30px;
  height: 30px;
  margin-top: 8px;
  margin-bottom: 8px;
}

#main-control a {
  color: white;
  box-sizing: border-box;
  width: 30px;
  cursor: pointer;
  padding: 20px 0 20px 5px;
}

#main-control a i {
  font-size: 16px;
}

#main-control .control-active {
  color: #ffffff;
  background-color: #1c7dc2;
}

#toc-container {
  width: 250px;
  height: calc(100% - 25px);
  box-sizing: border-box;
  position: absolute;
  left: 30px;
  top: 25px;
  background-color: white;
}

#style-editor {
  width: 250px;
  height: calc(100% - 25px);
  padding: 0;
  border: 0px;
  box-sizing: border-box;
  position: absolute;
  left: 30px;
  top: 25px;
  display: none;
}

#map-tool {
  position: absolute;
  left: 30px;
  bottom: 0px;
  display: flex;
  width: 250px;
  height: 30px;
  background-color: #f7f7f7;
  padding-top: 10px;
}

#map-tool button {
  color: #fff;
  background-color: #1c7ec4;
  border: none;
  box-shadow: 0 2px 2px 0 rgba(0,0,0,.14),0 3px 1px -2px rgba(0,0,0,.2),0 1px 5px 0 rgba(0,0,0,.12);
  border-radius: 2px;
  height: 26px;
  width: 55px;
  line-height: 26px;
  font-size: 14px;
  font-weight: 500;
  min-width: 30px;
  padding: 0;
  cursor: pointer;
  vertical-align: middle;
  margin: 0 33px;
}

#back-button {
  margin-right: 5px;
}

#back-button i {
  vertical-align: middle;
}

#delete-dialog{
  display: none;
}
#svg-editor{
  display: block;
  position: absolute;
  top: 25px;
  left: 30px;
  width: calc(100% - 30px);
  height: calc(100% - 25px);
}

/* #mapdata-view{
  visibility: hidden;
} */
</style>
