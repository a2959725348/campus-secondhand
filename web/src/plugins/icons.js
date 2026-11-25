/**
 * Element Plus 的图标需要单独引入。
 * 这里统一注册成全局组件，模板里直接写 <ArrowDown /> 就能用。
 */
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

export const iconNames = Object.keys(ElementPlusIconsVue);

export default {
  install(app) {
    for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
      app.component(name, component);
    }
  },
};
