import { Meteor } from 'meteor/meteor';
import { createFixtures } from 'meteor/unchained:core';
import configureUsers, { Users } from 'meteor/unchained:core-users';
import configureLogger from 'meteor/unchained:core-logger';
import configureDelivery from 'meteor/unchained:core-delivery';
import configurePayment from 'meteor/unchained:core-payment';
import configureWarehousing from 'meteor/unchained:core-warehousing';
import configureProducts from 'meteor/unchained:core-products';
import configureCurrencies from 'meteor/unchained:core-currencies';
import configureCountries from 'meteor/unchained:core-countries';
import configureLanguages from 'meteor/unchained:core-languages';
import configureAvatars from 'meteor/unchained:core-avatars';
import configureDocuments from 'meteor/unchained:core-documents';
import configureOrders from 'meteor/unchained:core-orders';
import configureAssortments from 'meteor/unchained:core-assortments';

const {
  FIXTURES,
} = process.env;

export { createFixtures };
export default createFixtures;

Meteor.startup(() => {
  if (!Meteor.isServer) return;

  // connect domain model
  configureLogger();
  configureCurrencies();
  configureCountries();
  configureLanguages();
  configureAvatars();
  configureDocuments();
  configureUsers();
  configureDelivery();
  configurePayment();
  configureWarehousing();
  configureProducts();
  configureOrders();
  configureAssortments();

  if (FIXTURES && Users.find({ username: 'admin' }).count() === 0) {
    createFixtures();
  }
});
