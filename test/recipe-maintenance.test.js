import test from 'node:test';
import assert from 'node:assert/strict';
import {isDemoRecipe,removeDemoRecipes} from '../public/src/recipe-maintenance.js';
const demo={id:1,name:'アボカドと卵のトースト',ingredients:['食パン','アボカド','卵'],img:'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=700&q=85'};
test('removes known seeded recipes and their plan/log references without changing user recipes',()=>{
 const own={id:1700000000000,name:'わたしの料理',ingredients:['卵'],img:'own.jpg'},original={recipes:[demo,own],foods:[{name:'卵'}],plans:{today:[1,own.id,own.id]},mealLog:{today:{'朝':{recipeId:1},'昼':[{recipeId:own.id}]}},shopping:[{name:'米'}]};const cleaned=removeDemoRecipes(original);assert.deepEqual(cleaned.removed,[1]);assert.deepEqual(cleaned.data.recipes,[own]);assert.deepEqual(cleaned.data.plans.today,{'朝':[],'昼':[own.id],'晩':[own.id]});assert.equal(cleaned.data.mealLog.today['朝'].length,0);assert.equal(cleaned.data.mealLog.today['昼'].length,1);assert.deepEqual(cleaned.data.foods,original.foods);assert.equal(original.recipes.length,2);assert.equal(removeDemoRecipes(cleaned.data).removed.length,0);
});
test('similar or customized user recipes are kept',()=>{for(const recipe of [{...demo,id:100},{...demo,img:'own.jpg'},{...demo,name:'わたしのトースト'},{...demo,steps:['自分の調理工程']},{...demo,ingredients:['卵']}])assert.equal(isDemoRecipe(recipe),false);});
